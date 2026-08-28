import type { Kysely } from 'kysely';
import { Money, Qty, formatDisplayDocNumber, newId } from '@shop/shared';
import type { Paisa } from '@shop/shared';
import {
  computeCostPerStockUnitPaisa,
  type NewPurchaseInput,
  type NewPurchaseResult,
  type PurchaseLineRecord,
  type PurchaseRecord,
  type PurchaseRepositoryPort,
} from '@shop/core';
import type { Database } from '../kysely-schema.js';

const PURCHASE_CODE_DOC_TYPE = 'purchase';
const PURCHASE_CODE_PREFIX = 'PUR';
const PARTS_BUSINESS_UNIT_CODE = 'PARTS';

export class KyselyPurchaseRepository implements PurchaseRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  private async nextPurchaseDocNo(trx: Kysely<Database>): Promise<string> {
    const existing = await trx
      .selectFrom('documentSequence')
      .select('nextNumber')
      .where('tenantId', '=', this.tenantId)
      .where('docType', '=', PURCHASE_CODE_DOC_TYPE)
      .where('deviceCode', '=', this.deviceCode)
      .executeTakeFirst();

    const nextNumber = existing?.nextNumber ?? 1;

    if (existing) {
      await trx
        .updateTable('documentSequence')
        .set({ nextNumber: nextNumber + 1 })
        .where('tenantId', '=', this.tenantId)
        .where('docType', '=', PURCHASE_CODE_DOC_TYPE)
        .where('deviceCode', '=', this.deviceCode)
        .execute();
    } else {
      await trx
        .insertInto('documentSequence')
        .values({
          tenantId: this.tenantId,
          docType: PURCHASE_CODE_DOC_TYPE,
          prefix: PURCHASE_CODE_PREFIX,
          deviceCode: this.deviceCode,
          nextNumber: 2,
        })
        .execute();
    }

    return formatDisplayDocNumber(PURCHASE_CODE_PREFIX, nextNumber);
  }

  private async resolvePartsBusinessUnitId(trx: Kysely<Database>): Promise<string> {
    const row = await trx
      .selectFrom('businessUnit')
      .select('id')
      .where('tenantId', '=', this.tenantId)
      .where('code', '=', PARTS_BUSINESS_UNIT_CODE)
      .executeTakeFirst();
    if (!row) {
      throw new Error(
        `No '${PARTS_BUSINESS_UNIT_CODE}' business unit found for tenant ${this.tenantId} — has the seed run?`,
      );
    }
    return row.id;
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

  async createPurchase(input: NewPurchaseInput): Promise<NewPurchaseResult> {
    if (input.lines.length === 0) {
      throw new Error('A purchase must have at least one line');
    }

    return this.db.transaction().execute(async (trx) => {
      const businessUnitId = await this.resolvePartsBusinessUnitId(trx);
      const warehouseId = input.warehouseId ?? (await this.resolveDefaultWarehouseId(trx));
      const docNo = await this.nextPurchaseDocNo(trx);
      const purchaseId = newId();
      const now = new Date().toISOString();

      const computedLines: Array<{
        lineNo: number;
        itemId: string;
        quantityMilli: number;
        stockQuantityMilli: number;
        unitCostPaisa: Paisa;
        costPerStockUnitPaisa: Paisa;
        lineTotalPaisa: Paisa;
        notes: string | null;
      }> = [];

      for (const [index, line] of input.lines.entries()) {
        const item = await trx
          .selectFrom('item')
          .select('purchaseToStockFactor')
          .where('id', '=', line.itemId)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!item) {
          throw new Error(`Item ${line.itemId} not found`);
        }

        const unitCostPaisa = Money.of(line.unitCostPaisa);
        const stockQuantityMilli = Qty.convert(
          Qty.of(line.quantityMilli),
          item.purchaseToStockFactor,
        );
        const costPerStockUnitPaisa = Money.of(
          computeCostPerStockUnitPaisa(unitCostPaisa, item.purchaseToStockFactor),
        );
        const lineTotalPaisa = Money.multiplyByQuantity(unitCostPaisa, line.quantityMilli);

        computedLines.push({
          lineNo: index + 1,
          itemId: line.itemId,
          quantityMilli: line.quantityMilli,
          stockQuantityMilli,
          unitCostPaisa,
          costPerStockUnitPaisa,
          lineTotalPaisa,
          notes: line.notes,
        });
      }

      const subtotalPaisa = Money.sum(computedLines.map((l) => l.lineTotalPaisa));
      const totalAmountPaisa = subtotalPaisa; // no discount/freight/tax this phase
      const paidAmountPaisa = input.paymentMode === 'cash' ? totalAmountPaisa : Money.ZERO;

      await trx
        .insertInto('purchase')
        .values({
          id: purchaseId,
          tenantId: this.tenantId,
          docNo,
          supplierId: input.supplierId,
          warehouseId,
          purchaseDate: input.purchaseDate,
          supplierInvoiceNo: input.supplierInvoiceNo,
          subtotal: subtotalPaisa,
          discountAmount: 0,
          freightAmount: 0,
          taxAmount: 0,
          totalAmount: totalAmountPaisa,
          paidAmount: paidAmountPaisa,
          paymentMode: input.paymentMode,
          status: 'confirmed',
          notes: input.notes,
          createdAt: now,
          updatedAt: now,
          createdBy: null,
          businessUnitId,
        })
        .execute();

      for (const line of computedLines) {
        await trx
          .insertInto('purchaseLine')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            purchaseId,
            lineNo: line.lineNo,
            itemId: line.itemId,
            quantity: line.quantityMilli,
            stockQuantity: line.stockQuantityMilli,
            unitCost: line.unitCostPaisa,
            discountAmount: 0,
            taxRate: 0,
            taxAmount: 0,
            lineTotal: line.lineTotalPaisa,
            notes: line.notes,
          })
          .execute();

        await trx
          .insertInto('stockMovement')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            itemId: line.itemId,
            warehouseId,
            movementDate: input.purchaseDate,
            movementType: 'purchase',
            quantity: line.stockQuantityMilli,
            unitCost: line.costPerStockUnitPaisa,
            serialId: null,
            sourceType: 'purchase',
            sourceId: purchaseId,
            reason: null,
            reversedById: null,
            createdAt: now,
            createdBy: null,
            businessUnitId,
          })
          .execute();

        // SIMPLIFIED, not a true weighted average — see docs/phases/PHASE_2.md.
        await trx
          .updateTable('item')
          .set({
            lastPurchaseCost: line.costPerStockUnitPaisa,
            avgCost: line.costPerStockUnitPaisa,
            updatedAt: now,
          })
          .where('id', '=', line.itemId)
          .where('tenantId', '=', this.tenantId)
          .execute();
      }

      if (input.paymentMode === 'credit') {
        // Negative: the shop's balance toward the supplier goes down
        // (we now owe them more), per the schema's documented sign
        // convention ("+ve = party owes US") that v_party_balance relies on.
        await trx
          .insertInto('partyLedger')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            partyId: input.supplierId,
            entryDate: input.purchaseDate,
            entryType: 'purchase',
            amount: Money.negate(totalAmountPaisa),
            runningNote: null,
            sourceType: 'purchase',
            sourceId: purchaseId,
            reversedById: null,
            createdAt: now,
            createdBy: null,
            billReference: input.billReference,
            dueDate: input.dueDate,
            billNotes: input.billNotes,
          })
          .execute();
      }

      await trx
        .insertInto('auditLog')
        .values({
          id: newId(),
          tenantId: this.tenantId,
          tableName: 'purchase',
          recordId: purchaseId,
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
          tableName: 'purchase',
          recordId: purchaseId,
          operation: 'insert',
          payload: null,
          createdAt: now,
          syncedAt: null,
          syncAttempts: 0,
          lastError: null,
        })
        .execute();

      return { id: purchaseId, docNo, totalAmountPaisa };
    });
  }

  async getPurchaseById(id: string): Promise<PurchaseRecord | null> {
    const purchase = await this.db
      .selectFrom('purchase')
      .select([
        'id',
        'docNo',
        'supplierId',
        'warehouseId',
        'purchaseDate',
        'paymentMode',
        'totalAmount',
        'paidAmount',
        'status',
        'businessUnitId',
      ])
      .where('id', '=', id)
      .where('tenantId', '=', this.tenantId)
      .executeTakeFirst();

    if (!purchase || !purchase.paymentMode || !purchase.businessUnitId) return null;

    const lines = await this.db
      .selectFrom('purchaseLine')
      .select(['itemId', 'quantity', 'stockQuantity', 'unitCost', 'lineTotal'])
      .where('purchaseId', '=', id)
      .where('tenantId', '=', this.tenantId)
      .orderBy('lineNo', 'asc')
      .execute();

    const lineRecords: PurchaseLineRecord[] = lines.map((l) => ({
      itemId: l.itemId,
      quantityMilli: l.quantity,
      stockQuantityMilli: l.stockQuantity,
      unitCostPaisa: l.unitCost,
      lineTotalPaisa: l.lineTotal,
    }));

    return {
      id: purchase.id,
      docNo: purchase.docNo,
      supplierId: purchase.supplierId,
      warehouseId: purchase.warehouseId,
      purchaseDate: purchase.purchaseDate,
      paymentMode: purchase.paymentMode as 'cash' | 'credit',
      totalAmountPaisa: purchase.totalAmount,
      paidAmountPaisa: purchase.paidAmount,
      status: purchase.status,
      businessUnitId: purchase.businessUnitId,
      lines: lineRecords,
    };
  }

  /**
   * Reversal never sets reversed_by_id and never updates a stock_movement
   * or party_ledger row's substantive columns — CLAUDE.md 3.3 treats any
   * update to those tables as a CRITICAL bug. The reversal is instead
   * discoverable by querying the same source_id with the *_return
   * movement/entry type. See docs/phases/PHASE_2.md for the reasoning.
   */
  async cancelPurchase(id: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const purchase = await trx
        .selectFrom('purchase')
        .select(['id', 'status', 'paymentMode', 'supplierId', 'purchaseDate'])
        .where('id', '=', id)
        .where('tenantId', '=', this.tenantId)
        .executeTakeFirst();
      if (!purchase) {
        throw new Error(`Purchase ${id} not found`);
      }
      if (purchase.status === 'cancelled') {
        throw new Error(`Purchase ${id} is already cancelled`);
      }

      const now = new Date().toISOString();

      const movements = await trx
        .selectFrom('stockMovement')
        .select(['itemId', 'warehouseId', 'quantity', 'unitCost', 'businessUnitId'])
        .where('tenantId', '=', this.tenantId)
        .where('sourceType', '=', 'purchase')
        .where('sourceId', '=', id)
        .where('movementType', '=', 'purchase')
        .execute();

      for (const movement of movements) {
        await trx
          .insertInto('stockMovement')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            itemId: movement.itemId,
            warehouseId: movement.warehouseId,
            movementDate: now,
            movementType: 'purchase_return',
            quantity: -movement.quantity,
            unitCost: movement.unitCost,
            serialId: null,
            sourceType: 'purchase',
            sourceId: id,
            reason: 'Purchase cancelled',
            reversedById: null,
            createdAt: now,
            createdBy: null,
            businessUnitId: movement.businessUnitId,
          })
          .execute();
      }

      if (purchase.paymentMode === 'credit') {
        const ledgerRow = await trx
          .selectFrom('partyLedger')
          .select(['amount'])
          .where('tenantId', '=', this.tenantId)
          .where('sourceType', '=', 'purchase')
          .where('sourceId', '=', id)
          .where('entryType', '=', 'purchase')
          .executeTakeFirst();
        if (!ledgerRow) {
          throw new Error(`Credit purchase ${id} has no party_ledger row to reverse`);
        }

        await trx
          .insertInto('partyLedger')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            partyId: purchase.supplierId,
            entryDate: now,
            entryType: 'purchase_return',
            amount: -ledgerRow.amount,
            runningNote: null,
            sourceType: 'purchase',
            sourceId: id,
            reversedById: null,
            createdAt: now,
            createdBy: null,
            billReference: null,
            dueDate: null,
            billNotes: null,
          })
          .execute();
      }

      await trx
        .updateTable('purchase')
        .set({ status: 'cancelled', updatedAt: now })
        .where('id', '=', id)
        .where('tenantId', '=', this.tenantId)
        .execute();

      await trx
        .insertInto('auditLog')
        .values({
          id: newId(),
          tenantId: this.tenantId,
          tableName: 'purchase',
          recordId: id,
          action: 'update',
          changedFields: JSON.stringify({ status: 'cancelled' }),
          oldValues: JSON.stringify({ status: purchase.status }),
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
          tableName: 'purchase',
          recordId: id,
          operation: 'update',
          payload: null,
          createdAt: now,
          syncedAt: null,
          syncAttempts: 0,
          lastError: null,
        })
        .execute();
    });
  }
}
