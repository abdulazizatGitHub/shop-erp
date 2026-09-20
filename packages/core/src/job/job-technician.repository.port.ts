/**
 * Repository interface (port) — defined here in core, implemented in db.
 * P14-1 scope: multi-technician assignment reads. P14-5 adds the
 * unassign write here too — assigning still goes through
 * JobRepositoryPort.assignTechnician (it also dual-writes job.assigned_to,
 * a `job` table column, so it stays where the rest of that table's
 * writes live); unassigning touches only job_technician, so it lives
 * with the rest of this table's logic instead.
 */
export interface TechnicianAssignmentRecord {
  readonly id: string;
  readonly jobId: string;
  readonly partyId: string;
  readonly assignedAt: string;
  /** null while the technician is still active on the job. */
  readonly unassignedAt: string | null;
}

export interface JobTechnicianRepositoryPort {
  /**
   * Plain filtered SELECT, assigned_at ASC (oldest/primary technician
   * first) — every job_technician row for this job, active AND
   * unassigned. No netting, no business logic: the caller (P14-5's
   * assignment panel, P14-8's History panel) decides what to show.
   */
  listTechnicianAssignments(jobId: string): Promise<readonly TechnicianAssignmentRecord[]>;
  /**
   * P14-5 — plain UPDATE setting job_technician.unassigned_at = now on
   * the given row. The row is NOT deleted (append-only — its full
   * history stays queryable, needed by P14-8's History panel). No other
   * table is touched: job.assigned_to is untouched (it means "the first
   * technician ever assigned," not "currently active," per P14-1's own
   * decision), and there is no audit_log/sync_outbox write for this
   * action, matching the owner's explicit "no other writes" scope for
   * this task.
   */
  unassignTechnician(id: string): Promise<void>;
}
