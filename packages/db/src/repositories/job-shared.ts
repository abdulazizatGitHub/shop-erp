import { type Kysely } from 'kysely';
import { formatDisplayDocNumber, newId } from '@shop/shared';
import type { JobRecord, JobStatus, NewJobClientInput } from '@shop/core';
import type { Database, JobTable } from '../kysely-schema.js';

/**
 * Plumbing shared by every job.* repository file (job.repository.ts,
 * job-query.repository.ts, job-technician.repository.ts): the row
 * shape/mapper, status derivation, invoice lookup, and the JOB-NNNN doc
 * number sequence. Split out in Phase 14/P14-2 purely to keep each
 * consuming file under the project's 300-line convention (job.repository.ts
 * was 656 lines after P14-1 — see PROJECT.md DEBT-6). No behaviour change.
 */

export const JOB_CODE_DOC_TYPE = 'job';
export const JOB_CODE_PREFIX = 'JOB';

export const JOB_RECORD_COLUMNS = [
  'id',
  'docNo',
  'customerId',
  'customerNameAdhoc',
  'customerPhone',
  'jobClientId',
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
  'cancellationReason',
  'diagnosis',
  'updatedAt',
  'notes',
] as const;

export type JobRow = Pick<JobTable, (typeof JOB_RECORD_COLUMNS)[number]>;

export function toJobRecord(
  row: JobRow,
  derivedStatus: JobStatus,
  invoiceDocNo: string | null,
  jobClientDisplay: JobClientDisplay = { name: null, phone: null },
): JobRecord {
  return {
    id: row.id,
    docNo: row.docNo,
    customerId: row.customerId,
    customerNameAdhoc: row.customerNameAdhoc,
    customerPhone: row.customerPhone,
    jobClientId: row.jobClientId,
    jobClientName: jobClientDisplay.name,
    jobClientPhone: jobClientDisplay.phone,
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
    cancellationReason: row.cancellationReason,
    diagnosedFault: row.diagnosis,
    updatedAt: row.updatedAt,
    notes: row.notes,
  };
}

/**
 * Current status is always DERIVED from the latest job_status_history row
 * — never trusted from job.status directly (GAP-6's STATUS MACHINE rule:
 * job.status is written once, at createJob, and never updated again).
 * Falls back to the job.status column only when no history row exists yet
 * — a defensive path for rows that predate this convention; createJob
 * always inserts the first history row in the same transaction, so real
 * application data never relies on it.
 */
export async function deriveStatus(
  qb: Kysely<Database>,
  tenantId: string,
  jobId: string,
  fallbackStatus: string,
): Promise<JobStatus> {
  const latest = await qb
    .selectFrom('jobStatusHistory')
    .select('toStatus')
    .where('jobId', '=', jobId)
    .where('tenantId', '=', tenantId)
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
export async function resolveInvoiceDocNo(
  qb: Kysely<Database>,
  tenantId: string,
  saleId: string | null,
): Promise<string | null> {
  if (!saleId) return null;
  const sale = await qb
    .selectFrom('sale')
    .select('docNo')
    .where('id', '=', saleId)
    .where('tenantId', '=', tenantId)
    .executeTakeFirst();
  return sale?.docNo ?? null;
}

export interface JobClientDisplay {
  readonly name: string | null;
  readonly phone: string | null;
}

/**
 * Phase 15 — job_client.name/phone for row.jobClientId, or {null, null}
 * when no client is linked. Same lookup-after-write pattern as
 * resolveInvoiceDocNo above, for the write paths (createJob,
 * updateJobStatus, assignTechnician) that don't already JOIN job_client
 * the way getJobQuery/listJobsQuery do.
 */
export async function resolveJobClientDisplay(
  qb: Kysely<Database>,
  tenantId: string,
  jobClientId: string | null,
): Promise<JobClientDisplay> {
  if (!jobClientId) return { name: null, phone: null };
  const jobClient = await qb
    .selectFrom('jobClient')
    .select(['name', 'phone'])
    .where('id', '=', jobClientId)
    .where('tenantId', '=', tenantId)
    .executeTakeFirst();
  return { name: jobClient?.name ?? null, phone: jobClient?.phone ?? null };
}

/**
 * Phase 15 — resolves job.job_client_id for createJob. Inlined here
 * (not via KyselyJobClientRepository, which opens its own separate
 * db.transaction()) so the jobClient INSERT and the job INSERT share
 * ONE transaction: if the job INSERT later fails, this row rolls back
 * with it. At most one of jobClientId/newClient should be set on the
 * input (CreateJobInput's own doc comment); both null returns null
 * (walk-in, no client recorded, OD-3).
 */
export async function resolveJobClientId(
  trx: Kysely<Database>,
  tenantId: string,
  jobClientId: string | null,
  newClient: NewJobClientInput | null,
): Promise<string | null> {
  if (newClient) {
    const id = newId();
    await trx
      .insertInto('jobClient')
      .values({
        id,
        tenantId,
        name: newClient.name,
        phone: newClient.phone,
        phone2: newClient.phone2,
        address: newClient.address,
        area: newClient.area,
        landmark: newClient.landmark,
        notes: newClient.notes,
        createdAt: new Date().toISOString(),
      })
      .execute();
    return id;
  }
  return jobClientId;
}

/** Next JOB-NNNN doc number — mutates document_sequence, must run inside the caller's transaction. */
export async function nextJobDocNo(
  trx: Kysely<Database>,
  tenantId: string,
  deviceCode: string,
): Promise<string> {
  const existing = await trx
    .selectFrom('documentSequence')
    .select('nextNumber')
    .where('tenantId', '=', tenantId)
    .where('docType', '=', JOB_CODE_DOC_TYPE)
    .where('deviceCode', '=', deviceCode)
    .executeTakeFirst();

  const nextNumber = existing?.nextNumber ?? 1;

  if (existing) {
    await trx
      .updateTable('documentSequence')
      .set({ nextNumber: nextNumber + 1 })
      .where('tenantId', '=', tenantId)
      .where('docType', '=', JOB_CODE_DOC_TYPE)
      .where('deviceCode', '=', deviceCode)
      .execute();
  } else {
    await trx
      .insertInto('documentSequence')
      .values({
        tenantId,
        docType: JOB_CODE_DOC_TYPE,
        prefix: JOB_CODE_PREFIX,
        deviceCode,
        nextNumber: 2,
      })
      .execute();
  }

  return formatDisplayDocNumber(JOB_CODE_PREFIX, nextNumber);
}
