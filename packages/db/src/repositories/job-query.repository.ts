import { sql, type Kysely } from 'kysely';
import type {
  JobRecord,
  JobSearchQuery,
  JobSplitRecord,
  JobStatusHistoryRecord,
  JobSummaryRecord,
  TechnicianCustodyRecord,
} from '@shop/core';
import type { Database } from '../kysely-schema.js';
import { deriveStatus, toJobRecord } from './job-shared.js';

/**
 * Read-side of the job repository — split out of job.repository.ts in
 * Phase 14/P14-2 to keep it under the project's 300-line convention (see
 * PROJECT.md DEBT-6). No behaviour change from what used to be private
 * methods on KyselyJobRepository.
 */

export async function getJobQuery(
  db: Kysely<Database>,
  tenantId: string,
  id: string,
): Promise<JobRecord | null> {
  const row = await db
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
      'job.cancellationReason',
      'job.diagnosis',
      'job.updatedAt',
      'sale.docNo as invoiceDocNo',
    ])
    .where('job.id', '=', id)
    .where('job.tenantId', '=', tenantId)
    .executeTakeFirst();

  if (!row) return null;

  const status = await deriveStatus(db, tenantId, id, row.status);
  return toJobRecord(row, status, row.invoiceDocNo ?? null);
}

/** Plain filtered SELECT, most recent first — no business logic. */
export async function listJobsQuery(
  db: Kysely<Database>,
  tenantId: string,
  query: JobSearchQuery,
): Promise<readonly JobSummaryRecord[]> {
  let q = db
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
      'promisedDate',
      'createdAt',
      'diagnosis',
      'saleId',
    ])
    .where('tenantId', '=', tenantId);

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
      status: await deriveStatus(db, tenantId, row.id, row.status),
      receivedDate: row.receivedDate,
      assignedTo: row.assignedTo,
      applianceType: row.applianceType,
      applianceBrand: row.applianceBrand,
      reportedFault: row.reportedFault,
      promisedDate: row.promisedDate,
      createdAt: row.createdAt,
      diagnosedFault: row.diagnosis,
      saleId: row.saleId,
    })),
  );

  // query.status filters on the DERIVED status, not the raw column — done
  // in JS after derivation rather than in SQL, at this shop's transaction
  // volume (DATABASE_RULES.md §6: "at 500 transactions/day none of this
  // is urgent").
  return query.status
    ? withDerivedStatus.filter((row) => row.status === query.status)
    : withDerivedStatus;
}

/** Reads v_job_split directly — never re-implements its aggregation. */
export async function getJobSplitQuery(
  db: Kysely<Database>,
  tenantId: string,
  jobId: string,
): Promise<JobSplitRecord | null> {
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
    WHERE   job_id = ${jobId} AND tenant_id = ${tenantId}
  `.execute(db);

  return result.rows[0] ?? null;
}

/**
 * What one technician currently holds, in exact milli-units. Does NOT
 * read v_technician_custody — see job.repository.port.ts's doc comment on
 * JobRepositoryPort.getTechnicianCustody for why (that view's qty_held is
 * a SQL-side float division, violating the milli-unit-integer contract).
 * Re-implements the identical WHERE/GROUP BY/HAVING shape, summing the
 * raw integer.
 */
export async function getTechnicianCustodyQuery(
  db: Kysely<Database>,
  tenantId: string,
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
            AND sm.tenant_id = ${tenantId}
    GROUP BY    sm.item_id, i.name_en, w.id
    HAVING      SUM(sm.quantity) <> 0
  `.execute(db);

  return result.rows;
}

/**
 * P14-8 — every job_status_history row for this job, oldest first. Plain
 * filtered SELECT, no netting/aggregation — the caller (History panel)
 * decides how to render each transition.
 */
export async function listJobStatusHistoryQuery(
  db: Kysely<Database>,
  tenantId: string,
  jobId: string,
): Promise<readonly JobStatusHistoryRecord[]> {
  const rows = await db
    .selectFrom('jobStatusHistory')
    .select(['fromStatus', 'toStatus', 'changedAt'])
    .where('jobId', '=', jobId)
    .where('tenantId', '=', tenantId)
    .orderBy('changedAt', 'asc')
    .execute();

  return rows.map((row) => ({
    fromStatus: row.fromStatus as JobStatusHistoryRecord['fromStatus'],
    toStatus: row.toStatus as JobStatusHistoryRecord['toStatus'],
    changedAt: row.changedAt,
  }));
}
