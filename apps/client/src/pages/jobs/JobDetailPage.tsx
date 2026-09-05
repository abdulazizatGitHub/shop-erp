import { useEffect, useState } from 'react';
import type { DeliverJobResult, JobDto } from '@shop/contracts';
import { Alert, Button } from '@shop/ui';
import type { JobPartRecord } from '../../types/electron-api.js';
import { ipc } from '../../lib/ipc.js';
import { JobActivitySection } from './JobActivitySection.js';
import { JobDeliveryDrawer } from './JobDeliveryDrawer.js';
import { JobDetailHeader } from './JobDetailHeader.js';
import { JobPartsSection } from './JobPartsSection.js';
import { JobPropertyPanel } from './JobPropertyPanel.js';

export interface JobDetailPageProps {
  readonly jobId: string;
  readonly onBack: () => void;
  /** Refreshes JobsPage's list in the background — does not navigate away. */
  readonly onListChanged: () => void;
}

/** Full-page job detail — replaces the old JobCardModal. Loads the job,
 * its technicians, its parts (shared by JobPartsSection and
 * JobActivitySection), and the customer's registered name, then renders
 * the sticky header, the two-column body, and the delivery drawer. */
export function JobDetailPage({
  jobId,
  onBack,
  onListChanged,
}: JobDetailPageProps): React.JSX.Element {
  const [job, setJob] = useState<JobDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<ReadonlyArray<{ id: string; name: string }>>([]);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [parts, setParts] = useState<readonly JobPartRecord[] | null>(null);
  const [partsError, setPartsError] = useState<string | null>(null);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [deliveredNotice, setDeliveredNotice] = useState<DeliverJobResult | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

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

  useEffect(() => {
    setLoadError(null);
    setDeliveredNotice(null);
    setJob(null);
    setParts(null);
    setCustomerName(null);
    ipc.job
      .getById({ id: jobId })
      .then((loaded) => {
        setJob(loaded);
        if (!loaded) {
          setLoadError('Job not found.');
          return;
        }
        loadParts(loaded.id);
        if (loaded.customerId) {
          ipc.customer
            .get(loaded.customerId)
            .then((customer) => {
              if (customer) setCustomerName(customer.name);
            })
            .catch(() => {
              // Customer section falls back to "…"; not fatal to viewing the job.
            });
        }
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
    <div className="flex flex-col">
      <JobDetailHeader
        docNo={job.docNo}
        applianceType={job.applianceType}
        applianceBrand={job.applianceBrand}
        reportedFault={job.reportedFault}
        status={job.status}
        onBack={onBack}
        onOpenDeliver={() => {
          setDeliverOpen(true);
        }}
      />

      <div className="flex gap-8 px-6 py-6">
        <div className="min-w-0 flex-1 flex flex-col gap-8">
          {job.status === 'cancelled' && (
            <p className="text-lg font-bold text-red-700">Job cancelled</p>
          )}
          {job.status === 'delivered' && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-600">
                Job delivered — invoice {deliveredNotice?.docNo ?? job.saleId ?? 'recorded'}.
              </p>
              {printError && (
                <Alert
                  variant="warning"
                  onDismiss={() => {
                    setPrintError(null);
                  }}
                >
                  Invoice did not print: {printError}
                </Alert>
              )}
              {job.saleId && (
                <Button
                  variant="secondary"
                  disabled={printing}
                  onClick={() => {
                    void handlePrint(job.saleId as string);
                  }}
                >
                  Print Invoice
                </Button>
              )}
            </div>
          )}

          <JobPartsSection
            job={job}
            technicians={technicians}
            parts={parts}
            loadError={partsError}
            onPartsChanged={() => {
              loadParts(job.id);
            }}
          />

          <JobActivitySection job={job} parts={parts} />
        </div>

        <JobPropertyPanel
          job={job}
          technicians={technicians}
          customerName={customerName}
          onJobChanged={setJob}
        />
      </div>

      {deliverOpen && (
        <JobDeliveryDrawer
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
    </div>
  );
}
