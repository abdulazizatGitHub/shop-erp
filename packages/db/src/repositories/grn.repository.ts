import { sql, type Kysely } from 'kysely';
import { Money, formatDisplayDocNumber, newId } from '@shop/shared';
import type { Paisa } from '@shop/shared';
import {
  GrnAlreadyCancelledError,
  GrnNotFoundError,
  InvalidGrnLineError,
  MissingSupplierForCreditError,
  PurchaseOrderCancelledError,
  PurchaseOrderNotFoundError,
  computeCostPerStockUnitPaisa,
  type GrnLineRecord,
  type GrnPaymentMode,
  type GrnRecord,
  type GrnRepositoryPort,
  type GrnStatus,
  type GrnSummary,
  type NewGrnInput,
  type NewGrnResult,
  type PurchaseOrderStatus,
} from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

const GRN_DOC_TYPE = 'grn';
const GRN_PREFIX = 'GRN';
const PARTS_BUSINESS_UNIT_CODE = 'PARTS';

export class KyselyGrnRepository implements GrnRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  private async nextGrnDocNo(trx: Kysely<Database>): Promise<string> {
    const existing = await trx
      .selectFrom('documentSequence')
      .select('nextNumber')
      .where('tenantId', '=', this.tenantId)
      .where('docType', '=', GRN_DOC_TYPE)
      .where('deviceCode', '=', this.deviceCode)
      .executeTakeFirst();

    const nextNumber = existing?.nextNumber ?? 1;

    if (existing) {
      await trx
        .updateTable('documentSequence')
        .set({ nextNumber: nextNumber + 1 })
        .where('tenantId', '=', this.tenantId)
        .where('docType', '=', GRN_DOC_TYPE)
        .where('deviceCode', '=', this.deviceCode)
        .execute();
    } else {
      await trx
        .insertInto('documentSequence')
        .values({
          tenantId: this.tenantId,
          docType: GRN_DOC_TYPE,
          prefix: GRN_PREFIX,
          deviceCode: this.deviceCode,
          nextNumber: 2,
        })
        .execute();
    }

    return formatDisplayDocNumber(GRN_PREFIX, nextNumber);
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

  /**
   * price_level has no `code` column — matched by its live `name` column
   * ('Retail'/'Wholesale', UNIQUE(tenant_id, name)). See
   * docs/phases/PHASE_9.md "Decisions" for why this doesn't add a code
   * column instead.
   */
  private async resolvePriceLevelId(
    trx: Kysely<Database>,
    name: 'Retail' | 'Wholesale',
  ): Promise<string> {
    const row = await trx
      .selectFrom('priceLevel')
      .select('id')
      .where('tenantId', '=', this.tenantId)
      .where('name', '=', name)
      .executeTakeFirst();
    if (!row) {
      throw new Error(
        `No '${name}' price level found for tenant ${this.tenantId} — has the seed run?`,
      );
    }
    return row.id;
  }

  /** Most recent row by effective_from — see PROJECT.md BUG-22 for the sibling mistake this avoids. */
  private async getCurrentItemPricePaisa(
    trx: Kysely<Database>,
    itemId: string,
    priceLevelId: string,
  ): Promise<number | null> {
    const row = await trx
      .selectFrom('itemPrice')
      .select('price')
      .where('tenantId', '=', this.tenantId)
      .where('itemId', '=', itemId)
      .where('priceLevelId', '=', priceLevelId)
      .orderBy('effectiveFrom', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row ? row.price : null;
  }

  /**
   * fully_received when every line's received >= ordered; partially_received
   * when at least one line has received > 0 but not all lines are full;
   * otherwise 'sent' — covers both the initial draft->sent transition and
   * a GRN cancellation bringing a previously partially/fully received PO
   * back down to zero received. Never reverts a 'cancelled' PO.
   */
  private async recomputePurchaseOrderStatus(
    trx: Kysely<Database>,
    purchaseOrderId: string,
    now: string,
  ): Promise<void> {
    const lines = await trx
      .selectFrom('purchaseOrderLine')
      .select(['quantityOrderedMilli', 'quantityReceivedMilli'])
      .where('purchaseOrderId', '=', purchaseOrderId)
      .where('tenantId', '=', this.tenantId)
      .execute();

    const po = await trx
      .selectFrom('purchaseOrder')
      .select(['status'])
      .where('id', '=', purchaseOrderId)
      .where('tenantId', '=', this.tenantId)
      .executeTakeFirstOrThrow();

    const allFullyReceived = lines.every((l) => l.quantityReceivedMilli >= l.quantityOrderedMilli);
    const someReceived = lines.some((l) => l.quantityReceivedMilli > 0);

    let newStatus: PurchaseOrderStatus;
    if (allFullyReceived) {
      newStatus = 'fully_received';
    } else if (someReceived) {
      newStatus = 'partially_received';
    } else {
      // Nothing currently received — 'sent' whether this is the initial
      // draft->sent transition or a GRN cancellation has brought a
      // previously partially/fully received PO back down to zero. A
      // cancelled PO is left alone (defensive only: cancel() already
      // refuses to cancel a PO with any confirmed GRN, so a cancelled PO
      // can never reach this function with lines to recompute from).
      newStatus = po.status === 'cancelled' ? 'cancelled' : 'sent';
    }

    await trx
      .updateTable('purchaseOrder')
      .set({ status: newStatus, updatedAt: now })
      .where('id', '=', purchaseOrderId)
      .where('tenantId', '=', this.tenantId)
      .execute();
  }

  async create(input: NewGrnInput): Promise<NewGrnResult> {
    if (input.lines.length === 0) {
      throw new Error('A GRN must have at least one line');
    }

    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        // a) PO must exist and not be cancelled.
        const po = await trx
          .selectFrom('purchaseOrder')
          .select(['id', 'status', 'supplierPartyId'])
          .where('id', '=', input.purchaseOrderId)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!po) {
          throw new PurchaseOrderNotFoundError(input.purchaseOrderId);
        }
        if (po.status === 'cancelled') {
          throw new PurchaseOrderCancelledError(input.purchaseOrderId);
        }

        // b) every planned line must belong to this PO.
        for (const line of input.lines) {
          if (line.purchaseOrderLineId !== null) {
            const pol = await trx
              .selectFrom('purchaseOrderLine')
              .select(['id', 'purchaseOrderId'])
              .where('id', '=', line.purchaseOrderLineId)
              .where('tenantId', '=', this.tenantId)
              .executeTakeFirst();
            if (!pol || pol.purchaseOrderId !== input.purchaseOrderId) {
              throw new InvalidGrnLineError(line.purchaseOrderLineId, input.purchaseOrderId);
            }
          }
        }

        // c) credit requires a resolvable supplier (on the GRN or inherited from the PO).
        const resolvedSupplierPartyId = input.supplierPartyId ?? po.supplierPartyId;
        if (input.paymentMode === 'credit' && !resolvedSupplierPartyId) {
          throw new MissingSupplierForCreditError();
        }

        // d) doc_no.
        const docNo = await this.nextGrnDocNo(trx);
        const grnId = newId();
        const now = new Date().toISOString();

        // e) insert grn.
        await trx
          .insertInto('grn')
          .values({
            id: grnId,
            tenantId: this.tenantId,
            docNo,
            purchaseOrderId: input.purchaseOrderId,
            supplierPartyId: input.supplierPartyId,
            supplierBillRef: input.supplierBillRef,
            grnDate: input.grnDate,
            paymentMode: input.paymentMode,
            status: 'confirmed',
            notes: input.notes,
            createdAt: now,
            updatedAt: now,
          })
          .execute();

        const businessUnitId = await this.resolvePartsBusinessUnitId(trx);
        const warehouseId = await this.resolveDefaultWarehouseId(trx);
        const retailPriceLevelId = await this.resolvePriceLevelId(trx, 'Retail');

        const lineTotalsPaisa: Paisa[] = [];

        // f) per line.
        for (const line of input.lines) {
          const item = await trx
            .selectFrom('item')
            .select(['purchaseToStockFactor', 'lastPurchaseCost'])
            .where('id', '=', line.itemId)
            .where('tenantId', '=', this.tenantId)
            .executeTakeFirst();
          if (!item) {
            throw new Error(`Item ${line.itemId} not found`);
          }

          await trx
            .insertInto('grnLine')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              grnId,
              purchaseOrderLineId: line.purchaseOrderLineId,
              itemId: line.itemId,
              quantityReceivedMilli: line.quantityReceivedMilli,
              unitCostPaisa: line.unitCostPaisa,
              sellingPricePaisa: line.sellingPricePaisa,
              wholesalePricePaisa: line.wholesalePricePaisa,
            })
            .execute();

          // grn_line.unit_cost_paisa is per PURCHASE-uom unit (e.g. per
          // cylinder), same convention as purchase_line.unit_cost. Convert
          // to per-stock-unit exactly like purchase.repository.ts does,
          // via the item's own purchaseToStockFactor — see
          // docs/phases/PHASE_9.md "Decisions" for the hand-verified
          // 3,500,000 / 13.6 -> 257,353 example this reuses verbatim.
          const costPerStockUnitPaisa = Money.of(
            computeCostPerStockUnitPaisa(line.unitCostPaisa, item.purchaseToStockFactor),
          );

          await trx
            .insertInto('stockMovement')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              itemId: line.itemId,
              warehouseId,
              movementDate: input.grnDate,
              movementType: 'purchase',
              quantity: line.quantityReceivedMilli,
              unitCost: costPerStockUnitPaisa,
              serialId: null,
              sourceType: 'grn',
              sourceId: grnId,
              reason: null,
              reversedById: null,
              createdAt: now,
              createdBy: null,
              businessUnitId,
            })
            .execute();

          lineTotalsPaisa.push(
            Money.multiplyByQuantity(costPerStockUnitPaisa, line.quantityReceivedMilli),
          );

          // Purchase cost — item.last_purchase_cost/avg_cost are always
          // per-stock-unit (same as item_price.price), so the comparison
          // and the update both use the CONVERTED cost, never the raw
          // grn_line.unit_cost_paisa.
          const oldPurchaseCostPaisa = item.lastPurchaseCost ?? 0;
          if (costPerStockUnitPaisa !== oldPurchaseCostPaisa) {
            await trx
              .insertInto('itemPriceHistory')
              .values({
                id: newId(),
                tenantId: this.tenantId,
                itemId: line.itemId,
                priceType: 'purchase_cost',
                oldValuePaisa: oldPurchaseCostPaisa,
                newValuePaisa: costPerStockUnitPaisa,
                changedAt: now,
                sourceType: 'grn',
                sourceId: grnId,
              })
              .execute();

            // SIMPLIFIED, not a true weighted average — same convention
            // as purchase.repository.ts. See docs/phases/PHASE_2.md.
            await trx
              .updateTable('item')
              .set({
                lastPurchaseCost: costPerStockUnitPaisa,
                avgCost: costPerStockUnitPaisa,
                updatedAt: now,
              })
              .where('id', '=', line.itemId)
              .where('tenantId', '=', this.tenantId)
              .execute();
          }

          // Retail price.
          const currentRetailPaisa = await this.getCurrentItemPricePaisa(
            trx,
            line.itemId,
            retailPriceLevelId,
          );
          const oldRetailPaisa = currentRetailPaisa ?? 0;
          if (line.sellingPricePaisa !== oldRetailPaisa) {
            await trx
              .insertInto('itemPriceHistory')
              .values({
                id: newId(),
                tenantId: this.tenantId,
                itemId: line.itemId,
                priceType: 'retail',
                oldValuePaisa: oldRetailPaisa,
                newValuePaisa: line.sellingPricePaisa,
                changedAt: now,
                sourceType: 'grn',
                sourceId: grnId,
              })
              .execute();

            await trx
              .insertInto('itemPrice')
              .values({
                id: newId(),
                tenantId: this.tenantId,
                itemId: line.itemId,
                priceLevelId: retailPriceLevelId,
                price: line.sellingPricePaisa,
                effectiveFrom: now,
                createdAt: now,
              })
              .execute();
          }

          // Wholesale price (optional).
          if (line.wholesalePricePaisa !== null) {
            const wholesalePriceLevelId = await this.resolvePriceLevelId(trx, 'Wholesale');
            const currentWholesalePaisa = await this.getCurrentItemPricePaisa(
              trx,
              line.itemId,
              wholesalePriceLevelId,
            );
            const oldWholesalePaisa = currentWholesalePaisa ?? 0;
            if (line.wholesalePricePaisa !== oldWholesalePaisa) {
              await trx
                .insertInto('itemPriceHistory')
                .values({
                  id: newId(),
                  tenantId: this.tenantId,
                  itemId: line.itemId,
                  priceType: 'wholesale',
                  oldValuePaisa: oldWholesalePaisa,
                  newValuePaisa: line.wholesalePricePaisa,
                  changedAt: now,
                  sourceType: 'grn',
                  sourceId: grnId,
                })
                .execute();

              await trx
                .insertInto('itemPrice')
                .values({
                  id: newId(),
                  tenantId: this.tenantId,
                  itemId: line.itemId,
                  priceLevelId: wholesalePriceLevelId,
                  price: line.wholesalePricePaisa,
                  effectiveFrom: now,
                  createdAt: now,
                })
                .execute();
            }
          }

          // purchase_order_line running total (planned lines only).
          if (line.purchaseOrderLineId !== null) {
            await trx
              .updateTable('purchaseOrderLine')
              .set((eb) => ({
                quantityReceivedMilli: eb('quantityReceivedMilli', '+', line.quantityReceivedMilli),
              }))
              .where('id', '=', line.purchaseOrderLineId)
              .where('tenantId', '=', this.tenantId)
              .execute();
          }
        }

        // g) credit ledger.
        if (input.paymentMode === 'credit') {
          const totalPaisa = Money.sum(lineTotalsPaisa);
          await trx
            .insertInto('partyLedger')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              partyId: resolvedSupplierPartyId as string,
              entryDate: input.grnDate,
              entryType: 'purchase',
              amount: Money.negate(totalPaisa),
              runningNote: null,
              sourceType: 'grn',
              sourceId: grnId,
              reversedById: null,
              createdAt: now,
              createdBy: null,
              billReference: input.supplierBillRef,
              dueDate: null,
              billNotes: null,
            })
            .execute();
        }

        // h) recompute purchase_order.status.
        await this.recomputePurchaseOrderStatus(trx, input.purchaseOrderId, now);

        // i) audit_log.
        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'grn',
            recordId: grnId,
            action: 'insert',
            changedFields: null,
            oldValues: null,
            userId: null,
            deviceCode: this.deviceCode,
            createdAt: now,
          })
          .execute();

        // j) sync_outbox.
        await trx
          .insertInto('syncOutbox')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'grn',
            recordId: grnId,
            operation: 'insert',
            payload: null,
            createdAt: now,
            syncedAt: null,
            syncAttempts: 0,
            lastError: null,
          })
          .execute();

        return { id: grnId, docNo };
      }),
    );
  }

  async get(id: string): Promise<GrnRecord | null> {
    const grnRow = await this.db
      .selectFrom('grn')
      .select([
        'id',
        'docNo',
        'purchaseOrderId',
        'supplierPartyId',
        'supplierBillRef',
        'grnDate',
        'paymentMode',
        'status',
        'notes',
      ])
      .where('id', '=', id)
      .where('tenantId', '=', this.tenantId)
      .executeTakeFirst();

    if (!grnRow) return null;

    const lines = await this.db
      .selectFrom('grnLine')
      .select([
        'id',
        'purchaseOrderLineId',
        'itemId',
        'quantityReceivedMilli',
        'unitCostPaisa',
        'sellingPricePaisa',
        'wholesalePricePaisa',
      ])
      .where('grnId', '=', id)
      .where('tenantId', '=', this.tenantId)
      .execute();

    const lineRecords: GrnLineRecord[] = lines.map((l) => ({
      id: l.id,
      purchaseOrderLineId: l.purchaseOrderLineId,
      itemId: l.itemId,
      quantityReceivedMilli: l.quantityReceivedMilli,
      unitCostPaisa: l.unitCostPaisa,
      sellingPricePaisa: l.sellingPricePaisa,
      wholesalePricePaisa: l.wholesalePricePaisa,
    }));

    return {
      id: grnRow.id,
      docNo: grnRow.docNo,
      purchaseOrderId: grnRow.purchaseOrderId,
      supplierPartyId: grnRow.supplierPartyId,
      supplierBillRef: grnRow.supplierBillRef,
      grnDate: grnRow.grnDate,
      paymentMode: grnRow.paymentMode as GrnPaymentMode,
      status: grnRow.status as GrnStatus,
      notes: grnRow.notes,
      lines: lineRecords,
    };
  }

  async listForPurchaseOrder(purchaseOrderId: string): Promise<readonly GrnSummary[]> {
    const rows = await this.db
      .selectFrom('grn as g')
      .leftJoin('grnLine as gl', (join) =>
        join.onRef('gl.grnId', '=', 'g.id').on('gl.tenantId', '=', this.tenantId),
      )
      .select([
        'g.id as id',
        'g.docNo as docNo',
        'g.grnDate as grnDate',
        'g.paymentMode as paymentMode',
        'g.status as status',
        (eb) => eb.fn.count<number>('gl.id').as('lineCount'),
        sql<number>`coalesce(sum(gl.quantity_received_milli), 0)`.as('totalReceivedMilli'),
      ])
      .where('g.tenantId', '=', this.tenantId)
      .where('g.purchaseOrderId', '=', purchaseOrderId)
      .groupBy(['g.id', 'g.docNo', 'g.grnDate', 'g.paymentMode', 'g.status', 'g.createdAt'])
      .orderBy('g.createdAt', 'desc')
      .execute();

    return rows.map((row): GrnSummary => ({
      id: row.id,
      docNo: row.docNo,
      grnDate: row.grnDate,
      paymentMode: row.paymentMode as GrnPaymentMode,
      status: row.status as GrnStatus,
      lineCount: row.lineCount,
      totalReceivedMilli: row.totalReceivedMilli,
    }));
  }

  /**
   * Reverses a confirmed GRN: posts reversing stock_movement rows (and,
   * for a credit GRN, a reversing party_ledger row), decrements the
   * purchase_order_line running totals it incremented, and recomputes
   * purchase_order.status. Never touches item_price_history or
   * item.last_purchase_cost/avg_cost — price history is permanent, the
   * cancellation itself is the record that a price change was voided,
   * not a reason to erase it. See docs/phases/PHASE_9.md.
   */
  async cancel(id: string): Promise<void> {
    await withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const grnRow = await trx
          .selectFrom('grn')
          .select(['id', 'status', 'purchaseOrderId', 'paymentMode'])
          .where('id', '=', id)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!grnRow) {
          throw new GrnNotFoundError(id);
        }
        if (grnRow.status === 'cancelled') {
          throw new GrnAlreadyCancelledError(id);
        }

        const now = new Date().toISOString();

        const lines = await trx
          .selectFrom('grnLine')
          .select(['purchaseOrderLineId', 'quantityReceivedMilli'])
          .where('grnId', '=', id)
          .where('tenantId', '=', this.tenantId)
          .execute();

        const movements = await trx
          .selectFrom('stockMovement')
          .select(['itemId', 'warehouseId', 'quantity', 'unitCost', 'businessUnitId'])
          .where('tenantId', '=', this.tenantId)
          .where('sourceType', '=', 'grn')
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
              movementType: 'purchase_cancellation',
              quantity: -movement.quantity,
              unitCost: movement.unitCost,
              serialId: null,
              sourceType: 'grn_cancellation',
              sourceId: id,
              reason: 'GRN cancelled',
              reversedById: null,
              createdAt: now,
              createdBy: null,
              businessUnitId: movement.businessUnitId,
            })
            .execute();
        }

        for (const line of lines) {
          if (line.purchaseOrderLineId !== null) {
            await trx
              .updateTable('purchaseOrderLine')
              .set((eb) => ({
                quantityReceivedMilli: eb('quantityReceivedMilli', '-', line.quantityReceivedMilli),
              }))
              .where('id', '=', line.purchaseOrderLineId)
              .where('tenantId', '=', this.tenantId)
              .execute();
          }
        }

        if (grnRow.paymentMode === 'credit') {
          const ledgerRow = await trx
            .selectFrom('partyLedger')
            .select(['amount', 'partyId'])
            .where('tenantId', '=', this.tenantId)
            .where('sourceType', '=', 'grn')
            .where('sourceId', '=', id)
            .where('entryType', '=', 'purchase')
            .executeTakeFirst();

          if (ledgerRow) {
            await trx
              .insertInto('partyLedger')
              .values({
                id: newId(),
                tenantId: this.tenantId,
                partyId: ledgerRow.partyId,
                entryDate: now,
                entryType: 'purchase_return',
                amount: -ledgerRow.amount,
                runningNote: null,
                sourceType: 'grn_cancellation',
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
        }

        await trx
          .updateTable('grn')
          .set({ status: 'cancelled', updatedAt: now })
          .where('id', '=', id)
          .where('tenantId', '=', this.tenantId)
          .execute();

        await this.recomputePurchaseOrderStatus(trx, grnRow.purchaseOrderId, now);

        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'grn',
            recordId: id,
            action: 'update',
            changedFields: JSON.stringify({ status: 'cancelled' }),
            oldValues: JSON.stringify({ status: grnRow.status }),
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
            tableName: 'grn',
            recordId: id,
            operation: 'update',
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
