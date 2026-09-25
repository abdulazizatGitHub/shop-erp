import type { JobStatus } from './job.repository.port.js';

/**
 * Phase 16, P16-3c (docs/phases/PHASE_16.md §2a OD-16-5). Pure — no DB,
 * no Electron, no React. Owns the two rules every job_technician write
 * path (assign AND unassign — both directions, per OD-16-5) must go
 * through, called from inside the repository's own transaction exactly
 * as commission-decision.repository.ts calls validateApprovalRecipients:
 * a `packages/core` pure function imported by `packages/db`, never a
 * service invoked from a repository.
 *
 * The lock applies to a job's CURRENT derived status (job_status_history,
 * never the job.status column — same rule as everywhere else in this
 * codebase). If a job later moves backwards from `ready` to an earlier
 * status, the lock lifts automatically — this function re-checks the
 * live status on every call, it does not remember a past lock.
 */
const LOCKED_STATUSES: ReadonlySet<JobStatus> = new Set(['ready', 'delivered', 'cancelled']);

export type TechnicianAssignmentAction = 'assign' | 'unassign';

export function assertTechnicianListUnlocked(
  status: JobStatus,
  action: TechnicianAssignmentAction,
): void {
  if (LOCKED_STATUSES.has(status)) {
    throw new Error(
      `Cannot ${action} a technician — the technician list is locked once a job reaches status "${status}" (OD-16-5)`,
    );
  }
}

/** Removal reason — trimmed, non-blank. Never required for assign. */
export function assertUnassignReasonProvided(reason: string): void {
  if (reason.trim().length === 0) {
    throw new Error('A reason is required to remove a technician from a job');
  }
}
