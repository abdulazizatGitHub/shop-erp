import type { Kysely } from 'kysely';
import { newId } from '@shop/shared';
import type { CommissionRepositoryPort, RecordCommissionInput } from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

const COMMISSION_LEDGER_ENTRY_TYPE = 'commission';

/**
 * labour_total_paisa for one delivery sale — SUM(sale_line.line_total)
 * WHERE business_unit_id = REPAIR's id (resolved by code, never
 * hardcoded — same convention attendance.service.ts's
 * deriveBusinessUnitCode/job-delivery.repository.ts's repairUnit lookup
 * both use) AND line_kind = 'labour'. Read-only — no transaction needed,
 * called from the handler BEFORE recordCommission's transaction opens
 * (PHASE_7.md P7-6 brief's explicit instruction: compute the amount
 * outside the commission transaction, which only records the result).
 */
export async function getLabourTotalPaisa(
  db: Kysely<Database>,
  tenantId: string,
  saleId: string,
): Promise<number> {
  const repairUnit = await db
    .selectFrom('businessUnit')
    .select('id')
    .where('tenantId', '=', tenantId)
    .where('code', '=', 'REPAIR')
    .executeTakeFirst();
  if (!repairUnit) {
    throw new Error(`REPAIR business unit not found for tenant ${tenantId} — has the seed run?`);
  }

  const result = await db
    .selectFrom('saleLine')
    .select(({ fn }) => fn.sum<number>('lineTotal').as('total'))
    .where('saleId', '=', saleId)
    .where('businessUnitId', '=', repairUnit.id)
    .where('lineKind', '=', 'labour')
    .executeTakeFirst();

  return result?.total ?? 0;
}

export class KyselyCommissionRepository implements CommissionRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  /**
   * PHASE_7.md §5 GAP-10/EC-P7-6 — amount is NEGATIVE (shop owes the
   * technician), the opposite sign from an advance's +ve (staff owes
   * the shop). source_type='job'/source_id=jobId, no linked payment row
   * (unlike an advance — commission is a liability recorded now, paid
   * out separately whenever wages are actually paid, not a cash
   * movement itself).
   */
  async recordCommission(input: RecordCommissionInput): Promise<void> {
    if (input.commissionPaisa <= 0) {
      throw new Error(
        `recordCommission requires commissionPaisa > 0, got ${String(input.commissionPaisa)}`,
      );
    }

    await withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const ledgerId = newId();
        const now = new Date().toISOString();

        await trx
          .insertInto('partyLedger')
          .values({
            id: ledgerId,
            tenantId: this.tenantId,
            partyId: input.technicianId,
            entryDate: input.deliveryDate,
            entryType: COMMISSION_LEDGER_ENTRY_TYPE,
            amount: -input.commissionPaisa,
            runningNote: null,
            sourceType: 'job',
            sourceId: input.jobId,
            reversedById: null,
            createdAt: now,
            createdBy: null,
            billReference: null,
            dueDate: null,
            billNotes: null,
          })
          .execute();

        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'party_ledger',
            recordId: ledgerId,
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
            tableName: 'party_ledger',
            recordId: ledgerId,
            operation: 'insert',
            payload: null,
            createdAt: now,
            syncedAt: null,
            syncAttempts: 0,
            lastError: null,
          })
          .execute();
      }),
    );
  }
}
