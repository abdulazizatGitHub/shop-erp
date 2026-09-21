/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Dependency inversion: core never imports db.
 *
 * Phase 15 — job clients are a table fully separate from `party`
 * (Q-P15-1 owner decision, BUG-JOBCLIENT-1). Field set mirrors OD-2's
 * exact `job_client` column list (packages/db/src/migrations/
 * 0016_job_client.sql).
 */
export interface NewJobClientInput {
  readonly name: string;
  readonly phone: string | null;
  readonly phone2: string | null;
  readonly address: string | null;
  readonly area: string | null;
  readonly landmark: string | null;
  readonly notes: string | null;
}

export interface JobClientRecord {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly phone2: string | null;
  readonly address: string | null;
  readonly area: string | null;
  readonly landmark: string | null;
  readonly notes: string | null;
}

export interface JobClientSearchQuery {
  readonly query: string;
}

export interface JobClientRepositoryPort {
  createJobClient(input: NewJobClientInput): Promise<JobClientRecord>;
  getJobClientById(id: string): Promise<JobClientRecord | null>;
  /** Matches against name OR phone (OD-5) — unlike party's searchCustomers, name-only. */
  searchJobClients(query: JobClientSearchQuery): Promise<readonly JobClientRecord[]>;
}
