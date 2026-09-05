import type { Kysely } from 'kysely';
import { formatDisplayDocNumber, newId } from '@shop/shared';
import { computeLineTotalPaisa } from '@shop/core';
import type {
  InternalTransferRepositoryPort,
  NewInternalTransferInput,
  NewInternalTransferResult,
} from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

const TRANSFER_DOC_TYPE = 'internal_transfer';
const TRANSFER_PREFIX = 'IT';

export class KyselyInternalTransferRepository implements InternalTransferRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  private async nextTransferDocNo(trx: Kysely<Database>): Promise<string> {
    const existing = await trx
      .selectFrom('documentSequence')
      .select('nextNumber')
      .where('tenantId', '=', this.tenantId)
      .where('docType', '=', TRANSFER_DOC_TYPE)
      .where('deviceCode', '=', this.deviceCode)
      .executeTakeFirst();

    const nextNumber = existing?.nextNumber ?? 1;

    if (existing) {
      await trx
        .updateTable('documentSequence')
        .set({ nextNumber: nextNumber + 1 })
        .where('tenantId', '=', this.tenantId)
        .where('docType', '=', TRANSFER_DOC_TYPE)
        .where('deviceCode', '=', this.deviceCode)
        .execute();
    } else {
      await trx
        .insertInto('documentSequence')
        .values({
          tenantId: this.tenantId,
          docType: TRANSFER_DOC_TYPE,
          prefix: TRANSFER_PREFIX,
          deviceCode: this.deviceCode,
          nextNumber: 2,
        })
        .execute();
    }

    return formatDisplayDocNumber(TRANSFER_PREFIX, nextNumber);
  }

  private async resolveDefaultWarehouseId(trx: Kysely<Database>): Promise<string> {
    const row = await trx
      .selectFrom('warehouse')
      .select('id')
      .where('tenantId', '=', this.tenantId)
      .where('isDefault', '=', 1)
      .executeTakeFirst();
    if (!row) {
      throw new Error(`No default warehouse found for tenant ${this.tenantId} — has the seed run?`);
    }
    return row.id;
  }

  /**
   * ONE stock_movement leg only (transfer_out, negative, from the Spare
   * Parts/default warehouse) — Repair owns no stock (SYSTEM_DESIGN.md
   * §4), so there is no second leg. valuation_method is always 'cost'
   * (GAP-5). business_unit_id on the stock_movement is REPAIR — it
   * caused this movement by consuming the parts unbilled, matching the
   * same "caused by" convention job_issue uses (0002_business_units.sql).
   */
  async createInternalTransfer(
    input: NewInternalTransferInput,
  ): Promise<NewInternalTransferResult> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const partsUnit = await trx
          .selectFrom('businessUnit')
          .select('id')
          .where('tenantId', '=', this.tenantId)
          .where('code', '=', 'PARTS')
          .executeTakeFirst();
        const repairUnit = await trx
          .selectFrom('businessUnit')
          .select('id')
          .where('tenantId', '=', this.tenantId)
          .where('code', '=', 'REPAIR')
          .executeTakeFirst();
        if (!partsUnit || !repairUnit) {
          throw new Error(
            `PARTS/REPAIR business units not found for tenant ${this.tenantId} — has the seed run?`,
          );
        }

        const warehouseId = await this.resolveDefaultWarehouseId(trx);

        const computedLines: Array<{
          itemId: string;
          quantityMilli: number;
          unitValuePaisa: number;
          lineTotalPaisa: number;
        }> = [];
        for (const line of input.lines) {
          const item = await trx
            .selectFrom('item')
            .select('avgCost')
            .where('id', '=', line.itemId)
            .where('tenantId', '=', this.tenantId)
            .executeTakeFirst();
          if (!item) {
            throw new Error(`Item ${line.itemId} not found`);
          }
          if (item.avgCost === null) {
            throw new Error(
              `Item ${line.itemId} has no avg_cost set — cannot transfer until it has been ` +
                `purchased at least once (internal_transfer_line.unit_value is NOT NULL)`,
            );
          }
          computedLines.push({
            itemId: line.itemId,
            quantityMilli: line.quantityMilli,
            unitValuePaisa: item.avgCost,
            lineTotalPaisa: computeLineTotalPaisa(item.avgCost, line.quantityMilli),
          });
        }

        const totalAmountPaisa = computedLines.reduce((sum, l) => sum + l.lineTotalPaisa, 0);
        const docNo = await this.nextTransferDocNo(trx);
        const transferId = newId();
        const now = new Date().toISOString();

        await trx
          .insertInto('internalTransfer')
          .values({
            id: transferId,
            tenantId: this.tenantId,
            docNo,
            transferDate: input.transferDate,
            fromUnitId: partsUnit.id,
            toUnitId: repairUnit.id,
            reason: input.reason,
            jobId: input.jobId,
            valuationMethod: 'cost',
            totalAmount: totalAmountPaisa,
            notes: input.notes,
            createdAt: now,
            createdBy: null,
          })
          .execute();

        for (const line of computedLines) {
          await trx
            .insertInto('internalTransferLine')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              transferId,
              itemId: line.itemId,
              quantity: line.quantityMilli,
              unitValue: line.unitValuePaisa,
              lineTotal: line.lineTotalPaisa,
            })
            .execute();

          await trx
            .insertInto('stockMovement')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              itemId: line.itemId,
              warehouseId,
              movementDate: input.transferDate,
              movementType: 'transfer_out',
              quantity: -line.quantityMilli,
              unitCost: line.unitValuePaisa,
              serialId: null,
              sourceType: 'internal_transfer',
              sourceId: transferId,
              reason: input.reason,
              reversedById: null,
              createdAt: now,
              createdBy: null,
              businessUnitId: repairUnit.id,
            })
            .execute();
        }

        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'internal_transfer',
            recordId: transferId,
            action: 'insert',
            changedFields: null,
            oldValues: null,
            userId: null,
            deviceCode: this.deviceCode,
            createdAt: now,
          })
          .execute();

        return { id: transferId, docNo, totalAmountPaisa };
      }),
    );
  }
}
