import type { Kysely } from 'kysely';
import { newId } from '@shop/shared';
import type { JobDiagnosisRepositoryPort, JobRecord, UpdateJobDiagnosisInput } from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';
import {
  deriveStatus,
  JOB_RECORD_COLUMNS,
  resolveInvoiceDocNo,
  toJobRecord,
} from './job-shared.js';

/** See job-diagnosis.repository.port.ts's doc comment on JobDiagnosisRepositoryPort.updateJobDiagnosisAndDate. */
export class KyselyJobDiagnosisRepository implements JobDiagnosisRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  async updateJobDiagnosisAndDate(input: UpdateJobDiagnosisInput): Promise<JobRecord> {
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
        const changedFields: Record<string, string | null> = {};
        const setValues: {
          updatedAt: string;
          diagnosis?: string | null;
          promisedDate?: string | null;
        } = { updatedAt: now };

        if (input.diagnosedFault !== undefined) {
          setValues.diagnosis = input.diagnosedFault;
          changedFields.diagnosedFault = input.diagnosedFault;
        }
        if (input.promisedDate !== undefined) {
          setValues.promisedDate = input.promisedDate;
          changedFields.promisedDate = input.promisedDate;
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

        const status = await deriveStatus(trx, this.tenantId, input.jobId, row.status);
        const invoiceDocNo = await resolveInvoiceDocNo(trx, this.tenantId, row.saleId);
        return toJobRecord(row, status, invoiceDocNo);
      }),
    );
  }
}
