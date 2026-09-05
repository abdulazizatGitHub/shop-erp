import { useState } from 'react';
import type { JobDto } from '@shop/contracts';
import { Alert, MoneyDisplay, QuantityDisplay } from '@shop/ui';
import type { JobPartRecord } from '../../types/electron-api.js';
import { JobIssuePartForm } from './JobIssuePartForm.js';

const HEADER_CELL = 'pb-2 text-xs font-semibold uppercase tracking-wider text-gray-400';
const DATA_CELL = 'border-b border-gray-100 py-2 text-sm text-gray-700';

export interface JobPartsSectionProps {
  readonly job: JobDto;
  readonly technicians: ReadonlyArray<{ id: string; name: string }>;
  readonly parts: readonly JobPartRecord[] | null;
  readonly loadError: string | null;
  readonly onPartsChanged: () => void;
}

/** "Parts & Labour": a borderless table of job_parts (issue rows) plus the
 * issue-a-part / add-labour-charge forms. Payer/Type columns are always
 * "—" — job_part carries neither field (they're only decided at delivery,
 * on the sale line), so this shows the gap rather than fabricating it.
 * `parts` is fetched once by JobDetailPage.tsx and shared with
 * JobActivitySection so both stay in sync off one IPC call. */
export function JobPartsSection({
  job,
  technicians,
  parts,
  loadError,
  onPartsChanged,
}: JobPartsSectionProps): React.JSX.Element {
  const [showIssueForm, setShowIssueForm] = useState(false);

  const issuedRows = (parts ?? []).filter((p) => p.entryType === 'issue');
  const isDelivered = job.status === 'delivered';
  const canAddLines = !isDelivered && job.status !== 'cancelled';

  return (
    <section>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Parts &amp; Labour
      </p>

      {loadError && <Alert variant="danger">{loadError}</Alert>}

      {issuedRows.length === 0 && !isDelivered ? (
        <p className="py-4 text-sm text-gray-400">No parts or labour added yet.</p>
      ) : (
        issuedRows.length > 0 && (
          <table className="w-full">
            <thead>
              <tr>
                <th className={`${HEADER_CELL} text-left`}>Item/Service</th>
                <th className={`${HEADER_CELL} text-left`}>Qty</th>
                <th className={`${HEADER_CELL} text-left`}>Price</th>
                <th className={`${HEADER_CELL} text-left`}>Payer</th>
                <th className={`${HEADER_CELL} text-right`}>Type</th>
              </tr>
            </thead>
            <tbody>
              {issuedRows.map((p) => (
                <tr key={p.id}>
                  <td className={DATA_CELL}>{p.itemName}</td>
                  <td className={DATA_CELL}>
                    <QuantityDisplay quantityMilli={p.quantityMilli} />
                  </td>
                  <td className={DATA_CELL}>
                    <MoneyDisplay paisaValue={p.unitPricePaisa} size="sm" />
                  </td>
                  <td className={DATA_CELL}>—</td>
                  <td className={`${DATA_CELL} text-right`}>—</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {isDelivered && (
        <p className="mt-3 text-sm text-gray-400">
          Labour charges recorded on {job.saleId ? 'the delivery invoice' : 'invoice'}. Print
          invoice to see the full breakdown.
        </p>
      )}

      {canAddLines && (
        <>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setShowIssueForm((v) => !v);
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:border-gray-400 hover:bg-gray-50"
            >
              + Add part
            </button>
          </div>

          <p className="mt-2 text-xs text-gray-400">
            Labour charges are added when you deliver the job.
          </p>

          {showIssueForm && (
            <JobIssuePartForm
              jobId={job.id}
              technicians={technicians}
              defaultTechnicianId={job.assignedTo}
              onIssued={() => {
                onPartsChanged();
                setShowIssueForm(false);
              }}
              onCancel={() => {
                setShowIssueForm(false);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
