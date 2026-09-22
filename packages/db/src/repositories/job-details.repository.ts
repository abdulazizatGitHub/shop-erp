import type { Kysely } from 'kysely';
import { newId } from '@shop/shared';
import type { JobDetailsRepositoryPort, JobRecord, UpdateJobDetailsInput } from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';
import {
  deriveStatus,
  JOB_RECORD_COLUMNS,
  resolveInvoiceDocNo,
  resolveJobClientDisplay,
  toJobRecord,
} from './job-shared.js';

/** I4/BUG-17 (partial) — narrow job:update for fields that need no
 * stock/ledger write. Same undefined-means-skip pattern as
 * job-diagnosis.repository.ts's updateJobDiagnosisAndDate. */
export class KyselyJobDetailsRepository implements JobDetailsRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  async updateJobDetails(input: UpdateJobDetailsInput): Promise<JobRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const existing = await trx
          .selectFrom('job')
          .select(['id', 'status'])
          .where('id', '=', input.jobId)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!existing) {
          throw new Error(`Job ${input.jobId} not found`);
        }

        const currentStatus = await deriveStatus(trx, this.tenantId, input.jobId, existing.status);
        if (currentStatus === 'delivered' || currentStatus === 'cancelled') {
          throw new Error('Cannot edit a delivered or cancelled job.');
        }

        const now = new Date().toISOString();
        const changedFields: Record<string, string | null> = {};
        const setValues: {
          updatedAt: string;
          jobClientId?: string | null;
          applianceType?: string | null;
          applianceBrand?: string | null;
          applianceModel?: string | null;
          applianceSerial?: string | null;
          reportedFault?: string | null;
          promisedDate?: string | null;
          notes?: string | null;
        } = { updatedAt: now };

        if (input.jobClientId !== undefined) {
          setValues.jobClientId = input.jobClientId;
          changedFields.jobClientId = input.jobClientId;
        }
        if (input.applianceType !== undefined) {
          setValues.applianceType = input.applianceType;
          changedFields.applianceType = input.applianceType;
        }
        if (input.applianceBrand !== undefined) {
          setValues.applianceBrand = input.applianceBrand;
          changedFields.applianceBrand = input.applianceBrand;
        }
        if (input.applianceModel !== undefined) {
          setValues.applianceModel = input.applianceModel;
          changedFields.applianceModel = input.applianceModel;
        }
        if (input.applianceSerial !== undefined) {
          setValues.applianceSerial = input.applianceSerial;
          changedFields.applianceSerial = input.applianceSerial;
        }
        if (input.reportedFault !== undefined) {
          setValues.reportedFault = input.reportedFault;
          changedFields.reportedFault = input.reportedFault;
        }
        if (input.promisedDate !== undefined) {
          setValues.promisedDate = input.promisedDate;
          changedFields.promisedDate = input.promisedDate;
        }
        if (input.notes !== undefined) {
          setValues.notes = input.notes;
          changedFields.notes = input.notes;
        }

        await trx
          .updateTable('job')
          .set(setValues)
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
            changedFields: JSON.stringify(changedFields),
            oldValues: null,
            userId: null,
            deviceCode: this.deviceCode,
            createdAt: now,
          })
          .execute();

        const row = await trx
          .selectFrom('job')
          .select(JOB_RECORD_COLUMNS)
          .where('id', '=', input.jobId)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirstOrThrow();

        const invoiceDocNo = await resolveInvoiceDocNo(trx, this.tenantId, row.saleId);
        const jobClientDisplay = await resolveJobClientDisplay(trx, this.tenantId, row.jobClientId);
        return toJobRecord(row, currentStatus, invoiceDocNo, jobClientDisplay);
      }),
    );
  }
}
