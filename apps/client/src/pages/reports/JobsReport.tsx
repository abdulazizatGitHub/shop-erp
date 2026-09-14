import { JobSplitReport } from './JobSplitReport.js';
import { TechnicianCustodySummary } from './TechnicianCustodySummary.js';

/** P6-9: the Reports tab's "Jobs" section — the split report and the custody summary. */
export function JobsReport(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <JobSplitReport />
      <div className="rounded-2xl bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-ink">Technician Custody</h2>
        <TechnicianCustodySummary />
      </div>
    </div>
  );
}
