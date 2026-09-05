import { useEffect, useMemo, useState } from 'react';
import type { DeliverJobInput, DeliverJobResult, JobDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { Alert, MoneyDisplay } from '@shop/ui';
import type { JobPartRecord, ServiceChargeOption } from '../../types/electron-api.js';
import { ipc } from '../../lib/ipc.js';
import { DeliveryPartLines, type PartLineEdit } from './DeliveryPartLines.js';
import { DeliveryLabourLines, type LabourLineEdit } from './DeliveryLabourLines.js';
import { JobDeliveryPaymentPanel } from './JobDeliveryPaymentPanel.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** issue rows with no matching return row — see DeliveryPartLines' doc comment: partial
 * returns aren't representable yet (DeliverJobPartLineInput has no adjustable quantity),
 * so a returned issue is excluded from delivery entirely rather than approximated. */
function deliverableParts(parts: readonly JobPartRecord[]): readonly JobPartRecord[] {
  const returnedIssueIds = new Set(
    parts
      .filter((p) => p.entryType === 'return' && p.reversesJobPartId)
      .map((p) => p.reversesJobPartId),
  );
  return parts.filter((p) => p.entryType === 'issue' && !returnedIssueIds.has(p.id));
}

export interface JobDeliveryDrawerProps {
  readonly job: JobDto;
  readonly onClose: () => void;
  readonly onDelivered: (result: DeliverJobResult) => void;
}

/**
 * Right-side slide-in drawer for delivering a job — the same delivery
 * logic as the retired JobDeliverTab.tsx (same hooks, same
 * ipc.job.deliver call, same DeliveryPartLines/DeliveryLabourLines/
 * JobDeliverPaymentBox reuse), just moved into a drawer shell instead of
 * a modal tab per the P6.5 full-page redesign.
 */
export function JobDeliveryDrawer({
  job,
  onClose,
  onDelivered,
}: JobDeliveryDrawerProps): React.JSX.Element {
  const [allParts, setAllParts] = useState<readonly JobPartRecord[] | null>(null);
  const [serviceCharges, setServiceCharges] = useState<readonly ServiceChargeOption[]>([]);
  const [partEdits, setPartEdits] = useState<Record<string, PartLineEdit>>({});
  const [labourLines, setLabourLines] = useState<readonly LabourLineEdit[]>([]);
  const [paidRupees, setPaidRupees] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const customerAvailable = job.customerId !== null;

  useEffect(() => {
    setError(null);
    setLabourLines([]);
    setPaidRupees('0');
    ipc.job
      .listJobParts(job.id)
      .then((parts) => {
        setAllParts(parts);
        const deliverableRows = deliverableParts(parts);
        setPartEdits(
          Object.fromEntries(
            deliverableRows.map((p) => [
              p.id,
              {
                priceRupees: String(Money.toRupees(Money.of(p.unitPricePaisa))),
                payer: customerAvailable ? 'customer' : 'walkin',
                revenueType: 'customer_paid',
              } satisfies PartLineEdit,
            ]),
          ),
        );
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load issued parts');
      });
    ipc.job
      .listServiceCharges()
      .then(setServiceCharges)
      .catch(() => {
        // Add-labour-line form degrades to an empty list; not fatal to delivering parts only.
      });
  }, [job.id]);

  const parts = useMemo(() => (allParts ? deliverableParts(allParts) : []), [allParts]);

  function resolvePayer(choice: PartLineEdit['payer']): string | null {
    return choice === 'customer' ? job.customerId : null;
  }

  const partsTotalPaisa = useMemo(
    () =>
      parts.reduce((sum, p) => {
        const edit = partEdits[p.id];
        if (!edit) return sum;
        let unitPricePaisa = 0;
        try {
          unitPricePaisa = Money.fromRupees(edit.priceRupees || '0');
        } catch {
          unitPricePaisa = 0;
        }
        return sum + Money.multiplyByQuantity(Money.of(unitPricePaisa), p.quantityMilli);
      }, 0),
    [parts, partEdits],
  );

  const labourTotalPaisa = useMemo(
    () =>
      labourLines.reduce((sum, line) => {
        const charge = serviceCharges.find((c) => c.id === line.serviceChargeId);
        let unitPricePaisa = charge?.retailChargePaisa ?? 0;
        if (line.priceRupees.trim().length > 0) {
          try {
            unitPricePaisa = Money.fromRupees(line.priceRupees);
          } catch {
            // falls back to the charge's default below
          }
        }
        return sum + unitPricePaisa;
      }, 0),
    [labourLines, serviceCharges],
  );

  const grandTotalPaisa = partsTotalPaisa + labourTotalPaisa;
  const grandTotalRupees = String(Money.toRupees(Money.of(grandTotalPaisa)));

  const payerSet = useMemo(() => {
    const ids = new Set<string>();
    parts.forEach((p) => {
      const payer = resolvePayer(partEdits[p.id]?.payer ?? 'walkin');
      if (payer) ids.add(payer);
    });
    labourLines.forEach((l) => {
      const payer = resolvePayer(l.payer);
      if (payer) ids.add(payer);
    });
    return ids;
  }, [parts, partEdits, labourLines]);
  const multiPayer = payerSet.size > 1;

  async function handleDeliver(): Promise<void> {
    setError(null);
    if (parts.length + labourLines.length === 0) {
      setError('Add at least one part or labour line before delivering');
      return;
    }
    let paidPaisa = 0;
    if (!multiPayer) {
      try {
        paidPaisa = Money.fromRupees(paidRupees || '0');
      } catch {
        setError('Amount paid is not a valid amount');
        return;
      }
    }
    let partLineInputs: DeliverJobInput['partLines'];
    try {
      partLineInputs = parts.map((p) => {
        const edit = partEdits[p.id];
        if (!edit) throw new Error(`Missing price/payer for ${p.itemName}`);
        return {
          jobPartId: p.id,
          unitPricePaisa: Money.fromRupees(edit.priceRupees || '0'),
          payerPartyId: resolvePayer(edit.payer),
          revenueType: edit.revenueType,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'One of the part prices is not valid');
      return;
    }
    let labourLineInputs: DeliverJobInput['labourLines'];
    try {
      labourLineInputs = labourLines.map((line) => ({
        serviceChargeId: line.serviceChargeId,
        unitPricePaisa:
          line.priceRupees.trim().length > 0 ? Money.fromRupees(line.priceRupees) : null,
        payerPartyId: resolvePayer(line.payer),
        revenueType: line.revenueType,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'One of the labour prices is not valid');
      return;
    }

    setSubmitting(true);
    try {
      const result = await ipc.job.deliver({
        jobId: job.id,
        saleDate: todayIso(),
        partLines: partLineInputs,
        labourLines: labourLineInputs,
        paidPaisa,
      });
      onDelivered(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delivery failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-[480px] flex-col bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-900">Deliver Job {job.docNo}</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="-m-1 rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        {error && <Alert variant="danger">{error}</Alert>}

        {allParts === null ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <>
            <section>
              <p className="mb-2 border-b border-gray-200 pb-1 text-sm font-semibold text-gray-700">
                Parts
              </p>
              <DeliveryPartLines
                parts={parts}
                edits={partEdits}
                customerAvailable={customerAvailable}
                onChange={(jobPartId, edit) => {
                  setPartEdits((prev) => ({ ...prev, [jobPartId]: edit }));
                }}
              />
            </section>

            <section className="border-t border-gray-200 pt-4">
              <p className="mb-2 border-b border-gray-200 pb-1 text-sm font-semibold text-gray-700">
                Labour
              </p>
              <DeliveryLabourLines
                lines={labourLines}
                serviceCharges={serviceCharges}
                customerAvailable={customerAvailable}
                onAdd={(line) => {
                  setLabourLines((prev) => [...prev, line]);
                }}
                onChange={(key, line) => {
                  setLabourLines((prev) => prev.map((l) => (l.key === key ? line : l)));
                }}
                onRemove={(key) => {
                  setLabourLines((prev) => prev.filter((l) => l.key !== key));
                }}
              />
            </section>

            <section className="flex flex-col gap-1 border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Parts total</span>
                <MoneyDisplay paisaValue={partsTotalPaisa} size="sm" />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Labour total</span>
                <MoneyDisplay paisaValue={labourTotalPaisa} size="sm" />
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-gray-200 pt-1">
                <span className="text-base font-bold text-gray-900">Total due</span>
                <MoneyDisplay paisaValue={grandTotalPaisa} size="total" />
              </div>
            </section>

            <JobDeliveryPaymentPanel
              multiPayer={multiPayer}
              paidRupees={paidRupees}
              onPaidRupeesChange={setPaidRupees}
              grandTotalRupees={grandTotalRupees}
              submitting={submitting}
              onDeliver={() => {
                void handleDeliver();
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
