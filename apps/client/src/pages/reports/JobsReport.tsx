import { JobSplitReport } from './JobSplitReport.js';
import { TechnicianCustodySummary } from './TechnicianCustodySummary.js';

/** P6-9: the Reports tab's "Jobs" section — the split report and the custody summary. */
export function JobsReport(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="mb-2 text-sm font-medium text-ink-muted">Job Split</p>
        <JobSplitReport />
      </section>
      <section className="border-t border-line pt-6">
        <p className="mb-2 text-sm font-medium text-ink-muted">Technician Custody</p>
        <TechnicianCustodySummary />
      </section>
    </div>
  );
}
