import { useEffect, useState } from 'react';
import type { JobStatus, JobSummaryDto } from '@shop/contracts';
import {
  Alert,
  EmptyState,
  LoadingState,
  Modal,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { STATUS_PILL_CLASSES } from './JobDetailHeader.js';
import { JobCreateForm } from './JobCreateForm.js';
import { JobDetailPage } from './JobDetailPage.js';

type StatusFilter = 'all' | JobStatus;

const STATUS_FILTERS: ReadonlyArray<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'received', label: 'Received' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'ready', label: 'Ready' },
  { key: 'delivered', label: 'Delivered' },
];

/** Truncates the fault text for the table column — the full text is on the job detail page. */
function truncate(text: string | null, max: number): string {
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function JobsPage(): React.JSX.Element {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [jobs, setJobs] = useState<readonly JobSummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [technicianNames, setTechnicianNames] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  function loadJobs(): void {
    ipc.job
      .list({
        status: statusFilter === 'all' ? null : statusFilter,
        assignedTo: null,
        customerId: null,
      })
      .then((rows) => {
        setJobs(rows);
        setError(null);
        const uniqueCustomerIds = [
          ...new Set(rows.map((r) => r.customerId).filter((id): id is string => id !== null)),
        ];
        uniqueCustomerIds.forEach((id) => {
          ipc.customer
            .get(id)
            .then((customer) => {
              if (customer) setCustomerNames((prev) => ({ ...prev, [id]: customer.name }));
            })
            .catch(() => {
              // Falls back to the raw id below; not fatal to the list.
            });
        });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load jobs');
      });
  }

  useEffect(() => {
    ipc.job
      .listTechnicians()
      .then((techs) => {
        setTechnicianNames(Object.fromEntries(techs.map((t) => [t.id, t.name])));
      })
      .catch(() => {
        // Technician column falls back to raw id; not fatal to the list.
      });
  }, []);

  useEffect(loadJobs, [statusFilter]);

  function handleCreated(): void {
    setCreateOpen(false);
    loadJobs();
  }

  function customerLabel(job: JobSummaryDto): string {
    if (job.customerNameAdhoc) return job.customerNameAdhoc;
    if (job.customerId) return customerNames[job.customerId] ?? '…';
    return 'Walk-in';
  }

  if (selectedJobId) {
    return (
      <JobDetailPage
        jobId={selectedJobId}
        onBack={() => {
          setSelectedJobId(null);
        }}
        onListChanged={loadJobs}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Jobs"
        actions={
          <button
            type="button"
            onClick={() => {
              setCreateOpen(true);
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            New Job
          </button>
        }
      />

      <select
        aria-label="Status filter"
        value={statusFilter}
        onChange={(e) => {
          setStatusFilter(e.target.value as StatusFilter);
        }}
        className="w-fit rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
      >
        {STATUS_FILTERS.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>

      {error && <Alert variant="danger">{error}</Alert>}

      {jobs === null ? (
        <LoadingState message="Loading jobs…" />
      ) : jobs.length === 0 ? (
        <EmptyState message="No jobs found." hint="Click New Job to create one." />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Job No</TableHeaderCell>
              <TableHeaderCell>Date</TableHeaderCell>
              <TableHeaderCell>Customer</TableHeaderCell>
              <TableHeaderCell>Appliance</TableHeaderCell>
              <TableHeaderCell>Fault</TableHeaderCell>
              <TableHeaderCell>Technician</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.map((job) => (
              // Raw <tr> (not the shared TableRow) so the whole row — not
              // each cell separately — gets one cursor-pointer/hover
              // treatment on click, per the P6.5 brief.
              <tr
                key={job.id}
                className="cursor-pointer even:bg-surface-sunken hover:bg-gray-50"
                onClick={() => {
                  setSelectedJobId(job.id);
                }}
              >
                <TableCell>{job.docNo}</TableCell>
                <TableCell>{job.receivedDate}</TableCell>
                <TableCell>{customerLabel(job)}</TableCell>
                <TableCell>
                  {[job.applianceType, job.applianceBrand].filter(Boolean).join(' — ') || '—'}
                </TableCell>
                <TableCell className="max-w-xs truncate" title={job.reportedFault ?? undefined}>
                  {truncate(job.reportedFault, 40)}
                </TableCell>
                <TableCell>
                  {job.assignedTo ? (technicianNames[job.assignedTo] ?? '…') : '—'}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL_CLASSES[job.status]}`}
                  >
                    {job.status}
                  </span>
                </TableCell>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal
        open={createOpen}
        title="New Job"
        onClose={() => {
          setCreateOpen(false);
        }}
      >
        <JobCreateForm
          onCreated={handleCreated}
          onCancel={() => {
            setCreateOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}
