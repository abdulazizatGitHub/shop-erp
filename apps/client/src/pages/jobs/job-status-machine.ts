import type { JobStatus } from '@shop/contracts';

/**
 * P14-3 — single source of truth for job status transitions, extracted
 * from JobPropertyPanel.tsx's old inline FORWARD_TRANSITIONS (which was
 * itself carried over unchanged from the retired JobDetailsSidebar.tsx).
 * Every call site that decides whether a status change is valid — the
 * manual "Update status →" picker, the auto-transition after a part is
 * issued, and the auto-transition after a diagnosis is saved — reads
 * from this one map via canTransition(), so the three can never
 * disagree (the exact risk flagged before this task was scoped).
 *
 * NOTE — two entries were added beyond a pure extraction, both required
 * by P14-3's own auto-transition rules (not present in the original
 * FORWARD_TRANSITIONS, which only supported manual moves):
 *   - received -> in_progress   (first part issued to a 'received' job)
 *   - in_progress -> diagnosed  (diagnosis saved while 'in_progress')
 * `awaiting_approval` still isn't routed through by anything real — dead
 * end, same as before. `ready` has no forward transition — Deliver is
 * the only way on from there. `cancelled` stays reachable from every
 * non-terminal status here (unchanged from the original map); P14-4's
 * own cancel-job transaction is expected to carry its own independent
 * guard (only that job.status !== 'delivered') rather than relying on
 * this map, since cancellation is a dedicated action/button, not
 * something routed through the manual status picker.
 */
export const ALLOWED_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  received: ['diagnosed', 'in_progress', 'awaiting_parts', 'cancelled'],
  diagnosed: ['awaiting_parts', 'in_progress', 'cancelled'],
  awaiting_approval: [],
  awaiting_parts: ['in_progress', 'cancelled'],
  in_progress: ['ready', 'diagnosed', 'awaiting_parts', 'cancelled'],
  ready: [],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Manual "Update status →" picker never offers delivered/cancelled —
 * those are reachable only via their own dedicated actions (Deliver,
 * Cancel), never a generic dropdown. */
export const MANUAL_PICKER_STATUSES: readonly JobStatus[] = [
  'diagnosed',
  'awaiting_approval',
  'awaiting_parts',
  'ready',
];

/** What the manual picker should actually offer for the job's current
 * status — ALLOWED_TRANSITIONS[currentStatus] intersected with the
 * always-manual-eligible set above. Never hardcode a second list. */
export function manualTransitionOptions(currentStatus: JobStatus): readonly JobStatus[] {
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  return MANUAL_PICKER_STATUSES.filter((status) => allowed.includes(status));
}

/**
 * P14-3's second auto-transition trigger ("diagnosed fault saved").
 * No UI calls this yet — the diagnosed-fault field/save path is P14-6,
 * not built in this task (job:update doesn't exist yet, BUG-17). Built
 * now, verified via a direct script against job:transitionStatus (see
 * this session's transcript), so P14-6 has one ready-made, already
 * state-machine-consistent function to call once it wires a real Save
 * button to it — not a second hand-rolled transition decision.
 * Returns the target status to transition to, or null if no transition
 * should fire (either the current status isn't received/in_progress, or
 * the transition isn't valid per ALLOWED_TRANSITIONS).
 */
export function diagnosisSavedTransitionTarget(currentStatus: JobStatus): JobStatus | null {
  if (currentStatus !== 'received' && currentStatus !== 'in_progress') return null;
  const target: JobStatus = 'diagnosed';
  return canTransition(currentStatus, target) ? target : null;
}

/**
 * P14-3's first auto-transition trigger ("first part issued to a job").
 * Returns the target status to transition to, or null if no transition
 * should fire. Guard: fires for 'received' (a job auto-advances on its
 * first part) AND 'awaiting_parts' (P15-6/OD-6 — the part that was being
 * waited on has now arrived, so the job resumes as 'in_progress' with no
 * extra click). A job already 'in_progress' or further along a part
 * issue does not move backward or re-trigger anything.
 */
export function partIssuedTransitionTarget(currentStatus: JobStatus): JobStatus | null {
  if (currentStatus !== 'received' && currentStatus !== 'awaiting_parts') return null;
  const target: JobStatus = 'in_progress';
  return canTransition(currentStatus, target) ? target : null;
}

/**
 * P15-6/OD-6 — statuses from which staff can explicitly mark a job as
 * awaiting parts. Kept as its own function (not inlined at each call
 * site) so the button-visibility rule lives in one place, matching this
 * file's own stated purpose for every other transition decision.
 */
export function canMarkAwaitingParts(status: JobStatus): boolean {
  return status === 'received' || status === 'diagnosed' || status === 'in_progress';
}
