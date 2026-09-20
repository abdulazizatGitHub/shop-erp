import { newId } from '@shop/shared';
import type { Kysely } from 'kysely';
import type {
  AssignTechnicianInput,
  JobRecord,
  JobTechnicianRepositoryPort,
  TechnicianAssignmentRecord,
} from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';
import {
  deriveStatus,
  JOB_RECORD_COLUMNS,
  resolveInvoiceDocNo,
  toJobRecord,
} from './job-shared.js';

export class KyselyJobTechnicianRepository implements JobTechnicianRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
  ) {}

  async listTechnicianAssignments(jobId: string): Promise<readonly TechnicianAssignmentRecord[]> {
    const rows = await this.db
      .selectFrom('jobTechnician')
      .select(['id', 'jobId', 'partyId', 'assignedAt', 'unassignedAt'])
      .where('jobId', '=', jobId)
      .where('tenantId', '=', this.tenantId)
      .orderBy('assignedAt', 'asc')
      .execute();

    return rows.map((row) => ({
      id: row.id,
      jobId: row.jobId,
      partyId: row.partyId,
      assignedAt: row.assignedAt,
      unassignedAt: row.unassignedAt,
    }));
  }

  /** See job-technician.repository.port.ts's doc comment — plain UPDATE, no other writes. */
  async unassignTechnician(id: string): Promise<void> {
    await this.db
      .updateTable('jobTechnician')
      .set({ unassignedAt: new Date().toISOString() })
      .where('id', '=', id)
      .where('tenantId', '=', this.tenantId)
      .execute();
  }
}

/**
 * Moved out of job.repository.ts (P14-2, keeping that file under the
 * 300-line convention — PROJECT.md DEBT-6). No behaviour change from
 * KyselyJobRepository's own assignTechnician method: job.assigned_to is
 * set ONCE, on the first technician ever assigned to a job, and left
 * alone after that (P14-1 decision — see docs/phases/PHASE_14.md §5),
 * so it keeps meaning "the primary/first technician" for every existing
 * reader (JobPropertyPanel.tsx, JobsPage.tsx's technician column),
 * unaffected by a second or third technician being added via
 * job_technician (P14-5). job_technician always gets a new INSERT row
 * regardless — it is the multi-technician source of truth going forward.
 * This function does not deduplicate or check whether the technician is
 * already active on the job — that's a P14-5 UI concern (the "Add
 * technician" dropdown excludes already-active technicians before this
 * is ever called).
 */
export async function assignTechnicianWrite(
  db: Kysely<Database>,
  tenantId: string,
  deviceCode: string,
  input: AssignTechnicianInput,
): Promise<JobRecord> {
  return withRetry(() =>
    db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('job')
        .select(['id', 'assignedTo'])
        .where('id', '=', input.jobId)
        .where('tenantId', '=', tenantId)
        .executeTakeFirst();
      if (!existing) {
        throw new Error(`Job ${input.jobId} not found`);
      }

      const now = new Date().toISOString();
      if (existing.assignedTo === null) {
        await trx
          .updateTable('job')
          .set({ assignedTo: input.technicianPartyId, updatedAt: now })
          .where('id', '=', input.jobId)
          .where('tenantId', '=', tenantId)
          .execute();
      }

      await trx
        .insertInto('jobTechnician')
        .values({
          id: newId(),
          tenantId,
          jobId: input.jobId,
          partyId: input.technicianPartyId,
          assignedAt: now,
          unassignedAt: null,
          createdAt: now,
        })
        .execute();

      await trx
        .insertInto('auditLog')
        .values({
          id: newId(),
          tenantId,
          tableName: 'job',
          recordId: input.jobId,
          action: 'update',
          changedFields: JSON.stringify({ assignedTo: input.technicianPartyId }),
          oldValues: null,
          userId: null,
          deviceCode,
          createdAt: now,
        })
        .execute();

      await trx
        .insertInto('syncOutbox')
        .values({
          id: newId(),
          tenantId,
          tableName: 'job',
          recordId: input.jobId,
          operation: 'update',
          payload: null,
          createdAt: now,
          syncedAt: null,
          syncAttempts: 0,
          lastError: null,
        })
        .execute();

      const row = await trx
        .selectFrom('job')
        .select(JOB_RECORD_COLUMNS)
        .where('id', '=', input.jobId)
        .where('tenantId', '=', tenantId)
        .executeTakeFirstOrThrow();

      const status = await deriveStatus(trx, tenantId, input.jobId, row.status);
      const invoiceDocNo = await resolveInvoiceDocNo(trx, tenantId, row.saleId);
      return toJobRecord(row, status, invoiceDocNo);
    }),
  );
}
