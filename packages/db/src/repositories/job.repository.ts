import type { Kysely } from 'kysely';
import { newId } from '@shop/shared';
import type {
  AssignTechnicianInput,
  JobRecord,
  JobRepositoryPort,
  JobSearchQuery,
  JobSplitRecord,
  JobStatus,
  JobStatusHistoryRecord,
  JobStatusTransitionInput,
  JobSummaryRecord,
  NewJobInput,
  TechnicianCustodyRecord,
} from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';
import {
  deriveStatus,
  JOB_RECORD_COLUMNS,
  nextJobDocNo,
  resolveInvoiceDocNo,
  toJobRecord,
} from './job-shared.js';
import {
  getJobQuery,
  getJobSplitQuery,
  getTechnicianCustodyQuery,
  listJobsQuery,
  listJobStatusHistoryQuery,
} from './job-query.repository.js';
import { assignTechnicianWrite } from './job-technician.repository.js';

/**
 * Write-side of the job repository. Read methods delegate to
 * job-query.repository.ts, shared plumbing to job-shared.ts, and
 * technician assignment to job-technician.repository.ts (all split out in
 * Phase 14/P14-2 to keep this file under the project's 300-line
 * convention — see PROJECT.md DEBT-6; this was 656 lines before the
 * split, no behaviour change, same code).
 */
export class KyselyJobRepository implements JobRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  async getJob(id: string): Promise<JobRecord | null> {
    return getJobQuery(this.db, this.tenantId, id);
  }

  /** Plain filtered SELECT, most recent first — no business logic. */
  async listJobs(query: JobSearchQuery): Promise<readonly JobSummaryRecord[]> {
    return listJobsQuery(this.db, this.tenantId, query);
  }

  /** Reads v_job_split directly — never re-implements its aggregation. */
  async getJobSplit(jobId: string): Promise<JobSplitRecord | null> {
    return getJobSplitQuery(this.db, this.tenantId, jobId);
  }

  /** See job-query.repository.ts's getTechnicianCustodyQuery doc comment. */
  async getTechnicianCustody(
    technicianPartyId: string,
  ): Promise<readonly TechnicianCustodyRecord[]> {
    return getTechnicianCustodyQuery(this.db, this.tenantId, technicianPartyId);
  }

  /** See job-query.repository.ts's listJobStatusHistoryQuery doc comment. */
  async listStatusHistory(jobId: string): Promise<readonly JobStatusHistoryRecord[]> {
    return listJobStatusHistoryQuery(this.db, this.tenantId, jobId);
  }

  /**
   * INSERT job (status = 'received', set once, never updated again) +
   * INSERT job_status_history (from_status = null, to_status =
   * 'received') + document_sequence (JOB-NNNN) + audit_log + sync_outbox,
   * one transaction. business_unit_id defaults to REPAIR — jobs earn
   * labour income; individual line-level PARTS/REPAIR tagging happens
   * later at delivery (ADR-0005), not at intake.
   */
  async createJob(input: NewJobInput): Promise<JobRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const repairUnit = await trx
          .selectFrom('businessUnit')
          .select('id')
          .where('tenantId', '=', this.tenantId)
          .where('code', '=', 'REPAIR')
          .executeTakeFirst();
        if (!repairUnit) {
          throw new Error(
            `No REPAIR business unit found for tenant ${this.tenantId} — has the seed run?`,
          );
        }

        const docNo = await nextJobDocNo(trx, this.tenantId, this.deviceCode);
        const jobId = newId();
        const now = new Date().toISOString();
        const status: JobStatus = 'received';

        await trx
          .insertInto('job')
          .values({
            id: jobId,
            tenantId: this.tenantId,
            docNo,
            customerId: input.customerId,
            customerNameAdhoc: input.customerNameAdhoc,
            customerPhone: input.customerPhone,
            jobType: input.jobType,
            applianceType: input.applianceType,
            applianceBrand: input.applianceBrand,
            applianceModel: input.applianceModel,
            applianceSerial: input.applianceSerial,
            reportedFault: input.reportedFault,
            accessoriesReceived: null,
            receivedDate: input.receivedDate,
            promisedDate: input.promisedDate,
            estimateAmount: input.estimateAmountPaisa,
            estimateApproved: 0,
            assignedTo: input.assignedTo,
            status,
            diagnosis: null,
            workDone: null,
            labourCharge: 0,
            partsCost: 0,
            totalCharge: 0,
            warrantyDays: 0,
            isWarrantyRework: 0,
            parentJobId: null,
            deliveredDate: null,
            saleId: null,
            notes: input.notes,
            createdAt: now,
            updatedAt: now,
            createdBy: null,
            businessUnitId: repairUnit.id,
            billToPartyId: null,
            revenueType: 'customer_paid',
            contractId: null,
            claimReference: null,
            claimStatus: null,
            cancellationReason: null,
          })
          .execute();

        await trx
          .insertInto('jobStatusHistory')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            jobId,
            fromStatus: null,
            toStatus: status,
            changedAt: now,
            changedBy: null,
            note: null,
          })
          .execute();

        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'job',
            recordId: jobId,
            action: 'insert',
            changedFields: null,
            oldValues: null,
            userId: null,
            deviceCode: this.deviceCode,
            createdAt: now,
          })
          .execute();

        await trx
          .insertInto('syncOutbox')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'job',
            recordId: jobId,
            operation: 'insert',
            payload: null,
            createdAt: now,
            syncedAt: null,
            syncAttempts: 0,
            lastError: null,
          })
          .execute();

        // Re-select rather than hand-reconstruct the record — same
        // pattern updateJobStatus/assignTechnician already use below,
        // and the single source of truth for what a freshly-created
        // job's columns actually are.
        const row = await trx
          .selectFrom('job')
          .select(JOB_RECORD_COLUMNS)
          .where('id', '=', jobId)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirstOrThrow();

        return toJobRecord(row, status, null);
      }),
    );
  }

  /**
   * INSERT-only status transition. Despite the name, this NEVER runs
   * `UPDATE job SET status = ...` — see job.repository.port.ts's doc
   * comment on JobRepositoryPort.updateJobStatus.
   */
  async updateJobStatus(input: JobStatusTransitionInput): Promise<JobRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const row = await trx
          .selectFrom('job')
          .select(JOB_RECORD_COLUMNS)
          .where('id', '=', input.jobId)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!row) {
          throw new Error(`Job ${input.jobId} not found`);
        }

        const fromStatus = await deriveStatus(trx, this.tenantId, input.jobId, row.status);
        const now = new Date().toISOString();

        await trx
          .insertInto('jobStatusHistory')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            jobId: input.jobId,
            fromStatus,
            toStatus: input.toStatus,
            changedAt: now,
            changedBy: null,
            note: input.note,
          })
          .execute();

        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'job_status_history',
            recordId: input.jobId,
            action: 'insert',
            changedFields: JSON.stringify({ toStatus: input.toStatus }),
            oldValues: JSON.stringify({ fromStatus }),
            userId: null,
            deviceCode: this.deviceCode,
            createdAt: now,
          })
          .execute();

        await trx
          .insertInto('syncOutbox')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'job_status_history',
            recordId: input.jobId,
            operation: 'insert',
            payload: null,
            createdAt: now,
            syncedAt: null,
            syncAttempts: 0,
            lastError: null,
          })
          .execute();

        const invoiceDocNo = await resolveInvoiceDocNo(trx, this.tenantId, row.saleId);
        return toJobRecord(row, input.toStatus, invoiceDocNo);
      }),
    );
  }

  /** See job-technician.repository.ts's assignTechnicianWrite doc comment. */
  async assignTechnician(input: AssignTechnicianInput): Promise<JobRecord> {
    return assignTechnicianWrite(this.db, this.tenantId, this.deviceCode, input);
  }
}
