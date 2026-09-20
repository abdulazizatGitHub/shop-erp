import type { CancellationReason } from '@shop/contracts';

/** OD-2's fixed reason list, human-readable. Shared between
 * CancelJobModal.tsx (the dropdown) and job-history-events.ts (the
 * "Job cancelled — [reason]" History event) — kept in its own file, not
 * re-exported from CancelJobModal.tsx, so the pure event-building module
 * doesn't import a React component (that module touches window.api at
 * import time via ipc.ts, which breaks a plain non-jsdom unit test). */
export const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  customer_declined_estimate: 'Customer declined estimate',
  unrepairable: 'Unrepairable',
  customer_collected_unrepaired: 'Customer collected unrepaired',
  duplicate_job: 'Duplicate job',
  other: 'Other',
};
