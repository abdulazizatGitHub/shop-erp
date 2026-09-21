import { useEffect, useState } from 'react';
import type { DeliverJobResult, JobDto } from '@shop/contracts';
import { Alert } from '@shop/ui';
import type { JobPartRecord } from '../../types/electron-api.js';
import { ipc } from '../../lib/ipc.js';
import { AwaitingPartsModal } from './AwaitingPartsModal.js';
import { CancelJobModal } from './CancelJobModal.js';
import { CANCELLATION_REASON_LABELS } from './cancellation-reason-labels.js';
import { DiagnosedFaultSection } from './DiagnosedFaultSection.js';
import { JobActivitySection } from './JobActivitySection.js';
import { JobDeliveryModal } from './JobDeliveryModal.js';
import { JobDetailHeader } from './JobDetailHeader.js';
import { partIssuedTransitionTarget } from './job-status-machine.js';
import { JobPartsSection } from './JobPartsSection.js';
import { JobPropertyPanel } from './JobPropertyPanel.js';
import { useAwaitingPartsReason } from './useAwaitingPartsReason.js';

export interface JobDetailPageProps {
  readonly jobId: string;
  readonly onBack: () => void;
  /** Refreshes JobsPage's list in the background — does not navigate away. */
  readonly onListChanged: () => void;
}

/** Full-page job detail — replaces the old JobCardModal. Loads the job,
 * its technicians, and its parts (shared by JobPartsSection and
 * JobActivitySection), then renders the sticky header, the two-column
 * body, and the delivery drawer. */
export function JobDetailPage({
  jobId,
  onBack,
  onListChanged,
}: JobDetailPageProps): React.JSX.Element {
  const [job, setJob] = useState<JobDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<ReadonlyArray<{ id: string; name: string }>>([]);
  const [parts, setParts] = useState<readonly JobPartRecord[] | null>(null);
  const [partsError, setPartsError] = useState<string | null>(null);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [deliveredNotice, setDeliveredNotice] = useState<DeliverJobResult | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [awaitingPartsOpen, setAwaitingPartsOpen] = useState(false);
  const awaitingPartsReason = useAwaitingPartsReason(job);

  useEffect(() => {
    ipc.job
      .listTechnicians()
      .then(setTechnicians)
      .catch(() => {
        // Technician name display degrades to "Unassigned"; not fatal to viewing the job.
      });
  }, []);

  function loadParts(id: string): void {
    ipc.job
      .listJobParts(id)
      .then((rows) => {
        setParts(rows);
        setPartsError(null);
      })
      .catch((err: unknown) => {
        setPartsError(err instanceof Error ? err.message : 'Failed to load parts');
      });
  }

  /**
   * P14-3 — first-part-issued auto-transition. Reloads the parts list
   * (as before P14-3) and, if the job is still 'received', advances it
   * to 'in_progress' via canTransition-gated job-status-machine.ts (never
   * a bare job:transitionStatus call — see this task's own scoping note
   * on the three call sites needing to agree). A transition failure is
   * swallowed rather than surfaced: the part issue itself already
   * succeeded and is the real user-facing action here; the status pill
   * simply stays as-is until the next issue or a manual override.
   */
  async function handlePartsChanged(): Promise<void> {
    if (!job) return;
    loadParts(job.id);
    const target = partIssuedTransitionTarget(job.status);
    if (target) {
      try {
        const updated = await ipc.job.transitionStatus({
          jobId: job.id,
          toStatus: target,
          note: null,
        });
        setJob(updated);
      } catch {
        // See doc comment above — non-fatal.
      }
    }
  }

  useEffect(() => {
    setLoadError(null);
    setDeliveredNotice(null);
    setJob(null);
    setParts(null);
    ipc.job
      .getById({ id: jobId })
      .then((loaded) => {
        setJob(loaded);
        if (!loaded) {
          setLoadError('Job not found.');
          return;
        }
        loadParts(loaded.id);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load job');
      });
  }, [jobId]);

  async function handlePrint(saleId: string): Promise<void> {
    setPrinting(true);
    try {
      const outcome = await ipc.invoice.printSaleInvoice(saleId);
      setPrintError(outcome.printError);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Print invoice failed');
    } finally {
      setPrinting(false);
    }
  }

  if (loadError) {
    return (
      <div className="p-6">
        <Alert variant="danger">{loadError}</Alert>
      </div>
    );
  }

  if (!job) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-8 px-6 py-6">
      <JobDetailHeader
        docNo={job.docNo}
        applianceType={job.applianceType}
        applianceBrand={job.applianceBrand}
        reportedFault={job.reportedFault}
        diagnosedFault={job.diagnosedFault}
        status={job.status}
        awaitingPartsReason={awaitingPartsReason}
        invoiceDocNo={deliveredNotice?.docNo ?? job.invoiceDocNo ?? null}
        saleId={job.saleId}
        printing={printing}
        onPrintInvoice={() => {
          void handlePrint(job.saleId as string);
        }}
        onBack={onBack}
        onOpenDeliver={() => {
          setDeliverOpen(true);
        }}
        onOpenCancel={() => {
          setCancelOpen(true);
        }}
        onOpenAwaitingParts={() => {
          setAwaitingPartsOpen(true);
        }}
      />

      <div className="flex gap-8">
        <div className="min-w-0 flex-1 flex flex-col gap-8">
          {job.status === 'cancelled' && (
            <p className="text-lg font-bold text-red-700">
              Job cancelled
              {job.cancellationReason && (
                <span className="ml-2 text-sm font-normal text-red-600">
                  —{' '}
                  {(CANCELLATION_REASON_LABELS as Record<string, string>)[job.cancellationReason] ??
                    job.cancellationReason}
                </span>
              )}
            </p>
          )}
          {job.status === 'delivered' && printError && (
            <Alert
              variant="warning"
              onDismiss={() => {
                setPrintError(null);
              }}
            >
              Invoice did not print: {printError}
            </Alert>
          )}

          {/* F2 — Reported/Diagnosed Fault now share one card, same
           * treatment as Parts & Labour/History below — was an unwrapped
           * text block sitting directly on the grey page background. */}
          <div className="rounded-2xl bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,.06),0_4px_16px_rgba(0,0,0,.06)]">
            <DiagnosedFaultSection job={job} onJobChanged={setJob} />
          </div>

          {/* V5 — same card-with-shadow treatment as the Customers list/
           * ledger-table cards (exact className copied from
           * CustomersPage.tsx), applied per-section so Parts & Labour and
           * History read as grouped surfaces instead of floating text. */}
          <div className="rounded-2xl bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,.06),0_4px_16px_rgba(0,0,0,.06)]">
            <JobPartsSection
              job={job}
              technicians={technicians}
              parts={parts}
              loadError={partsError}
              onPartsChanged={() => {
                void handlePartsChanged();
              }}
            />
          </div>

          <div className="rounded-2xl bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,.06),0_4px_16px_rgba(0,0,0,.06)]">
            <JobActivitySection
              job={job}
              parts={parts}
              technicianNames={Object.fromEntries(technicians.map((t) => [t.id, t.name]))}
            />
          </div>
        </div>

        <JobPropertyPanel job={job} technicians={technicians} onJobChanged={setJob} />
      </div>

      {deliverOpen && (
        <JobDeliveryModal
          job={job}
          onClose={() => {
            setDeliverOpen(false);
          }}
          onDelivered={(result) => {
            setDeliveredNotice(result);
            setDeliverOpen(false);
            onListChanged();
            ipc.job
              .getById({ id: job.id })
              .then((updated) => {
                if (updated) setJob(updated);
              })
              .catch(() => {
                // Status/pill stay on their pre-delivery state; not fatal — the
                // deliverJob call itself already succeeded, hence this callback.
              });
          }}
        />
      )}

      <CancelJobModal
        open={cancelOpen}
        job={job}
        onClose={() => {
          setCancelOpen(false);
        }}
        onCancelled={(updated) => {
          setCancelOpen(false);
          setJob(updated);
          onListChanged();
        }}
      />

      <AwaitingPartsModal
        open={awaitingPartsOpen}
        job={job}
        onClose={() => {
          setAwaitingPartsOpen(false);
        }}
        onConfirmed={(updated) => {
          setAwaitingPartsOpen(false);
          setJob(updated);
          onListChanged();
        }}
      />
    </div>
  );
}
