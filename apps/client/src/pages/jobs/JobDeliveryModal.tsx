import { useEffect, useMemo, useState } from 'react';
import type { DeliverJobInput, DeliverJobResult, JobDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { Alert, Modal } from '@shop/ui';
import type { JobPartRecord, ServiceChargeOption } from '../../types/electron-api.js';
import { ipc } from '../../lib/ipc.js';
import { DeliveryPartLines, type PartLineEdit } from './DeliveryPartLines.js';
import { DeliveryLabourLines, type LabourLineEdit } from './DeliveryLabourLines.js';
import { DeliveryTotals } from './DeliveryTotals.js';
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

export interface JobDeliveryModalProps {
  readonly job: JobDto;
  readonly onClose: () => void;
  readonly onDelivered: (result: DeliverJobResult) => void;
}

/**
 * F3 — centred modal, converted from the retired JobDeliveryDrawer.tsx
 * (a fixed right-side panel). Same delivery logic, same
 * DeliveryPartLines/DeliveryLabourLines/JobDeliveryPaymentPanel reuse —
 * only the container changed, to the same Modal wrapper CancelJobModal.tsx
 * uses (Modal already renders its own title + close (×) button, so the
 * hand-rolled header this file used to have is gone). `size="wide"` —
 * the content is tabular (multiple part/labour line columns), needs more
 * room than Modal's default max-w-md.
 */
export function JobDeliveryModal({
  job,
  onClose,
  onDelivered,
}: JobDeliveryModalProps): React.JSX.Element {
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
                otherPartyId: null,
                otherPartyName: null,
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

  function resolvePayer(edit: {
    readonly payer: PartLineEdit['payer'];
    readonly otherPartyId: string | null;
  }): string | null {
    if (edit.payer === 'customer') return job.customerId;
    if (edit.payer === 'other') return edit.otherPartyId;
    return null;
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
      const edit = partEdits[p.id];
      const payer = resolvePayer(edit ?? { payer: 'walkin', otherPartyId: null });
      if (payer) ids.add(payer);
    });
    labourLines.forEach((l) => {
      const payer = resolvePayer(l);
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
        if (edit.payer === 'other' && !edit.otherPartyId) {
          throw new Error(`Pick a payer party for ${p.itemName}`);
        }
        return {
          jobPartId: p.id,
          unitPricePaisa: Money.fromRupees(edit.priceRupees || '0'),
          payerPartyId: resolvePayer(edit),
          revenueType: edit.revenueType,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'One of the part prices is not valid');
      return;
    }
    let labourLineInputs: DeliverJobInput['labourLines'];
    try {
      labourLineInputs = labourLines.map((line) => {
        if (line.payer === 'other' && !line.otherPartyId) {
          throw new Error(`Pick a payer party for ${line.serviceChargeName}`);
        }
        return {
          serviceChargeId: line.serviceChargeId,
          unitPricePaisa:
            line.priceRupees.trim().length > 0 ? Money.fromRupees(line.priceRupees) : null,
          payerPartyId: resolvePayer(line),
          revenueType: line.revenueType,
        };
      });
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
    <Modal open title={`Deliver Job ${job.docNo}`} onClose={onClose} size="wide">
      <div className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto">
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

            <DeliveryTotals
              partsTotalPaisa={partsTotalPaisa}
              labourTotalPaisa={labourTotalPaisa}
              grandTotalPaisa={grandTotalPaisa}
            />

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
    </Modal>
  );
}
