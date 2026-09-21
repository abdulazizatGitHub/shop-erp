import { useEffect, useState } from 'react';
import type { JobStatus, JobSummaryDto } from '@shop/contracts';
import {
  Alert,
  Button,
  EmptyState,
  LoadingState,
  Modal,
  PageHeader,
  Table,
  TableBody,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextInput,
} from '@shop/ui';
import { Pagination } from '../../components/shared/Pagination.js';
import { ipc } from '../../lib/ipc.js';
import { JobCreateForm } from './JobCreateForm.js';
import { JobDetailPage } from './JobDetailPage.js';
import { JobsTableRow } from './JobsTableRow.js';

type StatusFilter = 'all' | JobStatus;

const STATUS_FILTERS: ReadonlyArray<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'received', label: 'Received' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'ready', label: 'Ready' },
  { key: 'delivered', label: 'Delivered' },
];

/** V4 — matches every report page's own constant (ItemsSoldTable.tsx,
 * ReceivablesAgingReport.tsx, etc. all use 10, not 20 — confirmed by
 * grep across every reports/*.tsx file before picking this value). */
const ROWS_PER_PAGE = 10;

export default function JobsPage(): React.JSX.Element {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [jobs, setJobs] = useState<readonly JobSummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [technicianNames, setTechnicianNames] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [printingJobId, setPrintingJobId] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

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

  useEffect(() => {
    loadJobs();
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [searchText]);

  function handleCreated(): void {
    setCreateOpen(false);
    loadJobs();
  }

  /**
   * P14-7/SUB-4 — job:list has no search parameter (JobSearchInput is
   * status/assignedTo/customerId only, confirmed by reading it before
   * building this), so this filters the already-fetched list client-side.
   * No debounce — nothing async happens per keystroke. P15-5 — matches
   * on jobClientName (denormalized by P15-3) instead of the old
   * per-row customer-id lookup.
   */
  function matchesSearch(job: JobSummaryDto): boolean {
    const q = searchText.trim().toLowerCase();
    if (q.length === 0) return true;
    const fault = (job.diagnosedFault ?? job.reportedFault ?? '').toLowerCase();
    return (
      job.docNo.toLowerCase().includes(q) ||
      (job.jobClientName ?? '').toLowerCase().includes(q) ||
      fault.includes(q)
    );
  }

  async function handlePrint(job: JobSummaryDto): Promise<void> {
    if (!job.saleId) return;
    setPrintingJobId(job.id);
    setPrintError(null);
    try {
      const outcome = await ipc.invoice.printSaleInvoice(job.saleId);
      setPrintError(outcome.printError);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Print invoice failed');
    } finally {
      setPrintingJobId(null);
    }
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

  const filteredJobs = (jobs ?? []).filter(matchesSearch);
  const visibleJobs = filteredJobs.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Jobs"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            New Job
          </Button>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}
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

      {/* V5 — same card-with-shadow container CustomersPage.tsx wraps
       * CustomerListView in (exact className copied from there), so the
       * jobs list reads as one grouped surface instead of a bare table
       * floating on the page background. */}
      <div className="rounded-2xl bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,.06),0_4px_16px_rgba(0,0,0,.06)]">
        <div className="mb-4 flex items-center gap-3">
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
          <div className="flex-1">
            <TextInput
              variant="search"
              aria-label="Search jobs"
              placeholder="Search by job number, customer, or fault…"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
              }}
            />
          </div>
        </div>

        {jobs === null ? (
          <LoadingState message="Loading jobs…" />
        ) : filteredJobs.length === 0 ? (
          <EmptyState message="No jobs found." hint="Click New Job to create one." />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Job No</TableHeaderCell>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Client</TableHeaderCell>
                <TableHeaderCell>Appliance</TableHeaderCell>
                <TableHeaderCell>Brand</TableHeaderCell>
                <TableHeaderCell>Fault</TableHeaderCell>
                <TableHeaderCell>Technicians</TableHeaderCell>
                <TableHeaderCell>Promised Date</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleJobs.map((job) => (
                <JobsTableRow
                  key={job.id}
                  job={job}
                  technicianLabel={job.assignedTo ? (technicianNames[job.assignedTo] ?? '…') : '—'}
                  onSelect={() => {
                    setSelectedJobId(job.id);
                  }}
                  onPrint={() => {
                    void handlePrint(job);
                  }}
                  printing={printingJobId === job.id}
                />
              ))}
            </TableBody>
          </Table>
        )}

        <Pagination
          totalRows={filteredJobs.length}
          rowsPerPage={ROWS_PER_PAGE}
          currentPage={page}
          onPageChange={setPage}
        />
      </div>

      <Modal
        open={createOpen}
        title="New Job"
        size="wide"
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
