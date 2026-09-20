import type { Kysely } from 'kysely';
import { newId } from '@shop/shared';
import type { CancelJobInput, JobCancelRepositoryPort, JobRecord } from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';
import {
  deriveStatus,
  JOB_RECORD_COLUMNS,
  resolveInvoiceDocNo,
  toJobRecord,
} from './job-shared.js';

function buildNotes(existingNotes: string | null, cancellationNotes: string): string {
  if (existingNotes === null || existingNotes.trim().length === 0) {
    return cancellationNotes;
  }
  return `${existingNotes}\n---\nCancellation note: ${cancellationNotes}`;
}

/**
 * See job-cancel.repository.port.ts's doc comment on
 * JobCancelRepositoryPort.cancelJob for the full write sequence this
 * follows (PLAN-A..D, docs/phases/PHASE_14.md §5).
 */
export class KyselyJobCancelRepository implements JobCancelRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  async cancelJob(input: CancelJobInput): Promise<JobRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const row = await trx
          .selectFrom('job')
          .select([...JOB_RECORD_COLUMNS, 'notes'])
          .where('id', '=', input.jobId)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!row) {
          throw new Error(`Job ${input.jobId} not found`);
        }

        const currentStatus = await deriveStatus(trx, this.tenantId, input.jobId, row.status);
        if (currentStatus === 'delivered') {
          throw new Error(`Job ${input.jobId} is already delivered and cannot be cancelled`);
        }
        if (currentStatus === 'cancelled') {
          throw new Error(`Job ${input.jobId} is already cancelled`);
        }

        const now = new Date().toISOString();

        // PLAN-A: every 'issue' row with no matching 'return' row.
        const jobParts = await trx
          .selectFrom('jobPart')
          .select([
            'id',
            'itemId',
            'quantity',
            'unitCost',
            'unitPrice',
            'businessUnitId',
            'isBillable',
            'entryType',
            'reversesJobPartId',
          ])
          .where('jobId', '=', input.jobId)
          .where('tenantId', '=', this.tenantId)
          .execute();

        const returnedIssueIds = new Set(
          jobParts
            .filter((p) => p.entryType === 'return' && p.reversesJobPartId !== null)
            .map((p) => p.reversesJobPartId as string),
        );
        const unreturnedIssues = jobParts.filter(
          (p) => p.entryType === 'issue' && !returnedIssueIds.has(p.id),
        );

        for (const issue of unreturnedIssues) {
          // PLAN-B: the technician's warehouse, read from the ORIGINAL
          // job_issue stock_movement row — not re-derived. Same query
          // shape as sale.repository.ts's cancelSale.
          const movement = await trx
            .selectFrom('stockMovement')
            .select(['warehouseId', 'unitCost', 'businessUnitId', 'quantity'])
            .where('tenantId', '=', this.tenantId)
            .where('sourceType', '=', 'job_part')
            .where('sourceId', '=', issue.id)
            .where('movementType', '=', 'job_issue')
            .executeTakeFirst();
          if (!movement) {
            throw new Error(`No job_issue stock_movement found for job_part ${issue.id}`);
          }

          const returnJobPartId = newId();
          await trx
            .insertInto('jobPart')
            .values({
              id: returnJobPartId,
              tenantId: this.tenantId,
              jobId: input.jobId,
              itemId: issue.itemId,
              quantity: issue.quantity,
              unitCost: issue.unitCost,
              unitPrice: issue.unitPrice,
              serialId: null,
              isReturned: 0,
              issuedAt: now,
              issuedBy: null,
              businessUnitId: issue.businessUnitId,
              isBillable: issue.isBillable,
              entryType: 'return',
              reversesJobPartId: issue.id,
            })
            .execute();

          // PLAN-C: movement_type='job_return'. PLAN-B/sign convention:
          // quantity is the negation of the original (negative) row's
          // quantity, landing positive — SUM(quantity) is a bare sum with
          // no movement_type sign multiplier anywhere in this codebase
          // (confirmed against v_stock_on_hand and getTechnicianCustodyQuery).
          await trx
            .insertInto('stockMovement')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              itemId: issue.itemId,
              warehouseId: movement.warehouseId,
              movementDate: now,
              movementType: 'job_return',
              quantity: -movement.quantity,
              unitCost: movement.unitCost,
              serialId: null,
              sourceType: 'job_part',
              sourceId: issue.id,
              reason: 'Job cancelled',
              reversedById: null,
              createdAt: now,
              createdBy: null,
              businessUnitId: movement.businessUnitId,
            })
            .execute();
        }

        const notesUpdate =
          input.notes !== null ? { notes: buildNotes(row.notes, input.notes) } : {};

        await trx
          .updateTable('job')
          .set({
            cancellationReason: input.reason,
            updatedAt: now,
            ...notesUpdate,
          })
          .where('id', '=', input.jobId)
          .where('tenantId', '=', this.tenantId)
          .execute();

        await trx
          .insertInto('jobStatusHistory')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            jobId: input.jobId,
            fromStatus: currentStatus,
            toStatus: 'cancelled',
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
            recordId: input.jobId,
            action: 'update',
            changedFields: JSON.stringify({
              status: 'cancelled',
              cancellationReason: input.reason,
            }),
            oldValues: JSON.stringify({ status: currentStatus }),
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

        const updatedRow = await trx
          .selectFrom('job')
          .select(JOB_RECORD_COLUMNS)
          .where('id', '=', input.jobId)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirstOrThrow();

        const invoiceDocNo = await resolveInvoiceDocNo(trx, this.tenantId, updatedRow.saleId);
        return toJobRecord(updatedRow, 'cancelled', invoiceDocNo);
      }),
    );
  }
}
