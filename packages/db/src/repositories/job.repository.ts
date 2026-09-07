import { sql, type Kysely } from 'kysely';
import { formatDisplayDocNumber, newId } from '@shop/shared';
import type {
  AssignTechnicianInput,
  JobRecord,
  JobRepositoryPort,
  JobSearchQuery,
  JobSplitRecord,
  JobStatus,
  JobStatusTransitionInput,
  JobSummaryRecord,
  NewJobInput,
  TechnicianCustodyRecord,
} from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database, JobTable } from '../kysely-schema.js';

const JOB_CODE_DOC_TYPE = 'job';
const JOB_CODE_PREFIX = 'JOB';

const JOB_RECORD_COLUMNS = [
  'id',
  'docNo',
  'customerId',
  'customerNameAdhoc',
  'customerPhone',
  'jobType',
  'applianceType',
  'applianceBrand',
  'applianceModel',
  'applianceSerial',
  'reportedFault',
  'receivedDate',
  'promisedDate',
  'estimateAmount',
  'estimateApproved',
  'assignedTo',
  'status',
  'businessUnitId',
  'billToPartyId',
  'revenueType',
  'labourCharge',
  'saleId',
] as const;

type JobRow = Pick<JobTable, (typeof JOB_RECORD_COLUMNS)[number]>;

function toJobRecord(
  row: JobRow,
  derivedStatus: JobStatus,
  invoiceDocNo: string | null,
): JobRecord {
  return {
    id: row.id,
    docNo: row.docNo,
    customerId: row.customerId,
    customerNameAdhoc: row.customerNameAdhoc,
    customerPhone: row.customerPhone,
    jobType: row.jobType,
    applianceType: row.applianceType,
    applianceBrand: row.applianceBrand,
    applianceModel: row.applianceModel,
    applianceSerial: row.applianceSerial,
    reportedFault: row.reportedFault,
    receivedDate: row.receivedDate,
    promisedDate: row.promisedDate,
    estimateAmountPaisa: row.estimateAmount,
    estimateApproved: row.estimateApproved === 1,
    assignedTo: row.assignedTo,
    status: derivedStatus,
    businessUnitId: row.businessUnitId,
    billToPartyId: row.billToPartyId,
    revenueType: row.revenueType,
    labourChargePaisa: row.labourCharge,
    saleId: row.saleId,
    invoiceDocNo,
  };
}

export class KyselyJobRepository implements JobRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  private async nextJobDocNo(trx: Kysely<Database>): Promise<string> {
    const existing = await trx
      .selectFrom('documentSequence')
      .select('nextNumber')
      .where('tenantId', '=', this.tenantId)
      .where('docType', '=', JOB_CODE_DOC_TYPE)
      .where('deviceCode', '=', this.deviceCode)
      .executeTakeFirst();

    const nextNumber = existing?.nextNumber ?? 1;

    if (existing) {
      await trx
        .updateTable('documentSequence')
        .set({ nextNumber: nextNumber + 1 })
        .where('tenantId', '=', this.tenantId)
        .where('docType', '=', JOB_CODE_DOC_TYPE)
        .where('deviceCode', '=', this.deviceCode)
        .execute();
    } else {
      await trx
        .insertInto('documentSequence')
        .values({
          tenantId: this.tenantId,
          docType: JOB_CODE_DOC_TYPE,
          prefix: JOB_CODE_PREFIX,
          deviceCode: this.deviceCode,
          nextNumber: 2,
        })
        .execute();
    }

    return formatDisplayDocNumber(JOB_CODE_PREFIX, nextNumber);
  }

  /**
   * Current status is always DERIVED from the latest job_status_history
   * row — never trusted from job.status directly (GAP-6's STATUS
   * MACHINE rule: job.status is written once, at createJob, and never
   * updated again). Falls back to the job.status column only when no
   * history row exists yet — a defensive path for rows that predate
   * this convention; createJob always inserts the first history row in
   * the same transaction, so real application data never relies on it.
   */
  private async deriveStatus(
    qb: Kysely<Database>,
    jobId: string,
    fallbackStatus: string,
  ): Promise<JobStatus> {
    const latest = await qb
      .selectFrom('jobStatusHistory')
      .select('toStatus')
      .where('jobId', '=', jobId)
      .where('tenantId', '=', this.tenantId)
      .orderBy('changedAt', 'desc')
      .orderBy('id', 'desc')
      .limit(1)
      .executeTakeFirst();
    return (latest?.toStatus ?? fallbackStatus) as JobStatus;
  }

  /**
   * P8-2 (BUG-P6.5-1): sale.doc_no for row.saleId, or null if the job
   * hasn't been delivered (saleId is null) yet.
   */
  private async resolveInvoiceDocNo(
    qb: Kysely<Database>,
    saleId: string | null,
  ): Promise<string | null> {
    if (!saleId) return null;
    const sale = await qb
      .selectFrom('sale')
      .select('docNo')
      .where('id', '=', saleId)
      .where('tenantId', '=', this.tenantId)
      .executeTakeFirst();
    return sale?.docNo ?? null;
  }

  async getJob(id: string): Promise<JobRecord | null> {
    const row = await this.db
      .selectFrom('job')
      .leftJoin('sale', 'sale.id', 'job.saleId')
      .select([
        'job.id',
        'job.docNo',
        'job.customerId',
        'job.customerNameAdhoc',
        'job.customerPhone',
        'job.jobType',
        'job.applianceType',
        'job.applianceBrand',
        'job.applianceModel',
        'job.applianceSerial',
        'job.reportedFault',
        'job.receivedDate',
        'job.promisedDate',
        'job.estimateAmount',
        'job.estimateApproved',
        'job.assignedTo',
        'job.status',
        'job.businessUnitId',
        'job.billToPartyId',
        'job.revenueType',
        'job.labourCharge',
        'job.saleId',
        'sale.docNo as invoiceDocNo',
      ])
      .where('job.id', '=', id)
      .where('job.tenantId', '=', this.tenantId)
      .executeTakeFirst();

    if (!row) return null;

    const status = await this.deriveStatus(this.db, id, row.status);
    return toJobRecord(row, status, row.invoiceDocNo ?? null);
  }

  /** Plain filtered SELECT, most recent first — no business logic. */
  async listJobs(query: JobSearchQuery): Promise<readonly JobSummaryRecord[]> {
    let q = this.db
      .selectFrom('job')
      .select([
        'id',
        'docNo',
        'customerId',
        'customerNameAdhoc',
        'jobType',
        'status',
        'receivedDate',
        'assignedTo',
        'applianceType',
        'applianceBrand',
        'reportedFault',
      ])
      .where('tenantId', '=', this.tenantId);

    if (query.assignedTo) {
      q = q.where('assignedTo', '=', query.assignedTo);
    }
    if (query.customerId) {
      q = q.where('customerId', '=', query.customerId);
    }

    const rows = await q.orderBy('receivedDate', 'desc').orderBy('createdAt', 'desc').execute();

    const withDerivedStatus = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        docNo: row.docNo,
        customerId: row.customerId,
        customerNameAdhoc: row.customerNameAdhoc,
        jobType: row.jobType,
        status: await this.deriveStatus(this.db, row.id, row.status),
        receivedDate: row.receivedDate,
        assignedTo: row.assignedTo,
        applianceType: row.applianceType,
        applianceBrand: row.applianceBrand,
        reportedFault: row.reportedFault,
      })),
    );

    // query.status filters on the DERIVED status, not the raw column —
    // done in JS after derivation rather than in SQL, at this shop's
    // transaction volume (DATABASE_RULES.md §6: "at 500 transactions/day
    // none of this is urgent").
    return query.status
      ? withDerivedStatus.filter((row) => row.status === query.status)
      : withDerivedStatus;
  }

  /** Reads v_job_split directly — never re-implements its aggregation. */
  async getJobSplit(jobId: string): Promise<JobSplitRecord | null> {
    const result = await sql<{
      jobId: string;
      docNo: string;
      receivedDate: string;
      jobType: string;
      revenueType: string;
      status: string;
      customerName: string | null;
      billedToName: string | null;
      technicianName: string | null;
      partsChargedPaisa: number;
      partsCostPaisa: number;
      partsMarginPaisa: number;
      labourChargePaisa: number;
      totalBillPaisa: number;
    }>`
      SELECT  job_id            AS jobId,
              doc_no            AS docNo,
              received_date     AS receivedDate,
              job_type          AS jobType,
              revenue_type      AS revenueType,
              status,
              customer_name     AS customerName,
              billed_to_name    AS billedToName,
              technician_name   AS technicianName,
              parts_charged_paisa AS partsChargedPaisa,
              parts_cost_paisa    AS partsCostPaisa,
              parts_margin_paisa  AS partsMarginPaisa,
              labour_charge_paisa AS labourChargePaisa,
              total_bill_paisa    AS totalBillPaisa
      FROM    v_job_split
      WHERE   job_id = ${jobId} AND tenant_id = ${this.tenantId}
    `.execute(this.db);

    return result.rows[0] ?? null;
  }

  /**
   * What one technician currently holds, in exact milli-units. Does NOT
   * read v_technician_custody — see job.repository.port.ts's doc comment
   * on this method for why (that view's qty_held is a SQL-side float
   * division, violating the milli-unit-integer contract). Re-implements
   * the identical WHERE/GROUP BY/HAVING shape, summing the raw integer.
   */
  async getTechnicianCustody(
    technicianPartyId: string,
  ): Promise<readonly TechnicianCustodyRecord[]> {
    const result = await sql<{
      itemId: string;
      itemName: string;
      qtyHeldMilli: number;
      lastMovement: string | null;
      warehouseId: string;
    }>`
      SELECT  sm.item_id                AS itemId,
              i.name_en                 AS itemName,
              SUM(sm.quantity)          AS qtyHeldMilli,
              MAX(sm.movement_date)     AS lastMovement,
              w.id                      AS warehouseId
      FROM        stock_movement sm
      JOIN        warehouse w  ON w.id  = sm.warehouse_id
      JOIN        item i       ON i.id  = sm.item_id
      WHERE       w.warehouse_kind = 'technician'
              AND w.custodian_party_id = ${technicianPartyId}
              AND sm.tenant_id = ${this.tenantId}
      GROUP BY    sm.item_id, i.name_en, w.id
      HAVING      SUM(sm.quantity) <> 0
    `.execute(this.db);

    return result.rows;
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

        const docNo = await this.nextJobDocNo(trx);
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

        return toJobRecord(
          {
            id: jobId,
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
            receivedDate: input.receivedDate,
            promisedDate: input.promisedDate,
            estimateAmount: input.estimateAmountPaisa,
            estimateApproved: 0,
            assignedTo: input.assignedTo,
            status,
            businessUnitId: repairUnit.id,
            billToPartyId: null,
            revenueType: 'customer_paid',
            labourCharge: 0,
            saleId: null,
          },
          status,
          null,
        );
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

        const fromStatus = await this.deriveStatus(trx, input.jobId, row.status);
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

        const invoiceDocNo = await this.resolveInvoiceDocNo(trx, row.saleId);
        return toJobRecord(row, input.toStatus, invoiceDocNo);
      }),
    );
  }

  /** Plain UPDATE to job.assigned_to — job is not an append-only table. */
  async assignTechnician(input: AssignTechnicianInput): Promise<JobRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const existing = await trx
          .selectFrom('job')
          .select(['id'])
          .where('id', '=', input.jobId)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!existing) {
          throw new Error(`Job ${input.jobId} not found`);
        }

        const now = new Date().toISOString();
        await trx
          .updateTable('job')
          .set({ assignedTo: input.technicianPartyId, updatedAt: now })
          .where('id', '=', input.jobId)
          .where('tenantId', '=', this.tenantId)
          .execute();

        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'job',
            recordId: input.jobId,
            action: 'update',
            changedFields: JSON.stringify({ assignedTo: input.technicianPartyId }),
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
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirstOrThrow();

        const status = await this.deriveStatus(trx, input.jobId, row.status);
        const invoiceDocNo = await this.resolveInvoiceDocNo(trx, row.saleId);
        return toJobRecord(row, status, invoiceDocNo);
      }),
    );
  }
}
