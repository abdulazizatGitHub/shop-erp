import { sql, type Kysely } from 'kysely';
import { formatDisplayDocNumber, Money, newId } from '@shop/shared';
import {
  computeLineTotalPaisa,
  isCreditLimitExceeded,
  isStockBelowZero,
  resolvePricePaisa,
  type NewSaleInput,
  type NewSaleResult,
  type SaleLineRecord,
  type SaleRecord,
  type SaleRepositoryPort,
  type SaleSearchQuery,
  type SaleSummaryRecord,
} from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

const SALE_CODE_DOC_TYPE = 'sale';
const SALE_CODE_PREFIX = 'INV';

export class KyselySaleRepository implements SaleRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  private async nextSaleDocNo(trx: Kysely<Database>): Promise<string> {
    const existing = await trx
      .selectFrom('documentSequence')
      .select('nextNumber')
      .where('tenantId', '=', this.tenantId)
      .where('docType', '=', SALE_CODE_DOC_TYPE)
      .where('deviceCode', '=', this.deviceCode)
      .executeTakeFirst();

    const nextNumber = existing?.nextNumber ?? 1;

    if (existing) {
      await trx
        .updateTable('documentSequence')
        .set({ nextNumber: nextNumber + 1 })
        .where('tenantId', '=', this.tenantId)
        .where('docType', '=', SALE_CODE_DOC_TYPE)
        .where('deviceCode', '=', this.deviceCode)
        .execute();
    } else {
      await trx
        .insertInto('documentSequence')
        .values({
          tenantId: this.tenantId,
          docType: SALE_CODE_DOC_TYPE,
          prefix: SALE_CODE_PREFIX,
          deviceCode: this.deviceCode,
          nextNumber: 2,
        })
        .execute();
    }

    return formatDisplayDocNumber(SALE_CODE_PREFIX, nextNumber);
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

  private async readStockOnHandMilli(
    trx: Kysely<Database>,
    itemId: string,
    warehouseId: string,
  ): Promise<number> {
    // Reads the view, never re-implements the SUM (docs/SYSTEM_DESIGN.md §7).
    const result = await sql<{ qtyMilli: number }>`
      SELECT qty_milli AS qtyMilli
      FROM v_stock_on_hand
      WHERE item_id = ${itemId} AND warehouse_id = ${warehouseId} AND tenant_id = ${this.tenantId}
    `.execute(trx);
    return result.rows[0]?.qtyMilli ?? 0;
  }

  private async readCustomerBalancePaisa(
    trx: Kysely<Database>,
    customerId: string,
  ): Promise<number> {
    // Same query as KyselyPartyRepository.getCustomerBalance, but run
    // against `trx` instead of `this.db`. Deliberately NOT calling that
    // method here: it queries its own `this.db`, and issuing a second
    // connection-acquisition against the same underlying SqliteDriver
    // mutex while a transaction is already open on `trx` risks a deadlock
    // (see docs/phases/PHASE_2.md §5c on Kysely's per-connection
    // ConnectionMutex). Reading through `trx` also means this read is
    // re-run in full on every withRetry attempt — required by BUG-15's
    // constraint that a SQLITE_BUSY retry restarts the ENTIRE
    // transaction, not just the failed write, so a stale balance from a
    // discarded attempt can never be combined with a later attempt's write.
    const result = await sql<{ balancePaisa: number }>`
      SELECT balance_paisa AS balancePaisa
      FROM v_party_balance
      WHERE party_id = ${customerId} AND tenant_id = ${this.tenantId}
    `.execute(trx);
    return result.rows[0]?.balancePaisa ?? 0;
  }

  async createSale(input: NewSaleInput): Promise<NewSaleResult> {
    if (input.lines.length === 0) {
      throw new Error('A sale must have at least one line');
    }

    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        // Every read below (price levels, item lookups, item_price rows,
        // stock, customer balance) runs through `trx` and lives inside
        // this SAME withRetry-wrapped closure as the writes further down
        // — not before db.transaction() opens, and not via a second
        // connection. See readCustomerBalancePaisa's comment for why.
        const warehouseId = input.warehouseId ?? (await this.resolveDefaultWarehouseId(trx));

        const priceLevelRows = await trx
          .selectFrom('priceLevel')
          .select(['id', 'isDefault'])
          .where('tenantId', '=', this.tenantId)
          .execute();
        const priceLevels = priceLevelRows.map((l) => ({ id: l.id, isDefault: l.isDefault === 1 }));
        const defaultPriceLevel = priceLevels.find((level) => level.isDefault);
        if (!defaultPriceLevel) {
          throw new Error('No default (Retail) price level configured — has the seed run?');
        }

        let customerPriceLevelId: string | null = null;
        if (input.customerId) {
          const customer = await trx
            .selectFrom('party')
            .select('priceLevelId')
            .where('id', '=', input.customerId)
            .where('tenantId', '=', this.tenantId)
            .executeTakeFirst();
          customerPriceLevelId = customer?.priceLevelId ?? null;
        }

        interface ComputedLine {
          readonly lineNo: number;
          readonly itemId: string;
          readonly nameEn: string;
          readonly quantityMilli: number;
          readonly unitPricePaisa: number;
          readonly unitCostPaisa: number | null;
          readonly lineTotalPaisa: number;
          readonly businessUnitId: string;
          /**
           * ADR-0013 Type 2 — the amount actually deducted from stock, in
           * stock_uom milli-units. Equal to quantityMilli when the line
           * was entered in stock_uom (saleUomId absent). When entered in
           * an alt unit: Math.round((quantityMilli * saleToStockFactor) /
           * 1000) — the only permitted float-adjacent operation.
           */
          readonly stockQuantityMilli: number;
          readonly saleUomId: string | null;
          readonly saleToStockFactor: number | null;
        }
        const computedLines: ComputedLine[] = [];
        let unitCostMissing = false;
        let stockBelowZero = false;

        for (const [index, line] of input.lines.entries()) {
          const item = await trx
            .selectFrom('item')
            .select(['nameEn', 'businessUnitId', 'avgCost'])
            .where('id', '=', line.itemId)
            .where('tenantId', '=', this.tenantId)
            .executeTakeFirst();
          if (!item) {
            throw new Error(`Item ${line.itemId} not found`);
          }
          if (!item.businessUnitId) {
            throw new Error(`Item ${line.itemId} has no business_unit_id set`);
          }

          const itemPriceRows = await trx
            .selectFrom('itemPrice')
            .select(['priceLevelId', 'price'])
            .where('itemId', '=', line.itemId)
            .where('tenantId', '=', this.tenantId)
            .execute();

          const unitPricePaisa =
            line.unitPricePaisa ??
            resolvePricePaisa(
              customerPriceLevelId,
              itemPriceRows.map((p) => ({ priceLevelId: p.priceLevelId, pricePaisa: p.price })),
              priceLevels,
            );

          const lineTotalPaisa = computeLineTotalPaisa(unitPricePaisa, line.quantityMilli);

          if (item.avgCost === null) unitCostMissing = true;

          // ADR-0013 Type 2: when saleUomId is absent, stock deduction
          // equals the input quantity unchanged (existing behavior). When
          // present, convert to stock_uom milli-units — never re-derive
          // the factor from the item's current alt_uom_factor_milli, use
          // exactly what the caller supplied (the snapshot sale_line
          // will store).
          const stockQuantityMilli =
            line.saleUomId !== undefined && line.saleToStockFactor !== undefined
              ? Math.round((line.quantityMilli * line.saleToStockFactor) / 1000)
              : line.quantityMilli;

          const currentQtyMilli = await this.readStockOnHandMilli(trx, line.itemId, warehouseId);
          if (isStockBelowZero(currentQtyMilli, stockQuantityMilli)) stockBelowZero = true;

          computedLines.push({
            lineNo: index + 1,
            itemId: line.itemId,
            nameEn: item.nameEn,
            quantityMilli: line.quantityMilli,
            unitPricePaisa,
            unitCostPaisa: item.avgCost,
            lineTotalPaisa,
            businessUnitId: item.businessUnitId,
            stockQuantityMilli,
            saleUomId: line.saleUomId ?? null,
            saleToStockFactor: line.saleToStockFactor ?? null,
          });
        }

        const subtotalPaisa = Money.sum(computedLines.map((l) => Money.of(l.lineTotalPaisa)));
        const totalAmountPaisa = subtotalPaisa;

        let creditLimitExceeded = false;
        if (input.paymentMode === 'credit' && input.customerId) {
          const customerRow = await trx
            .selectFrom('party')
            .select('creditLimit')
            .where('id', '=', input.customerId)
            .where('tenantId', '=', this.tenantId)
            .executeTakeFirst();
          const creditLimitPaisa = customerRow?.creditLimit ?? null;
          const currentBalancePaisa = await this.readCustomerBalancePaisa(trx, input.customerId);
          creditLimitExceeded = isCreditLimitExceeded(
            currentBalancePaisa,
            creditLimitPaisa,
            totalAmountPaisa,
          );
        }

        const docNo = await this.nextSaleDocNo(trx);
        const saleId = newId();
        const now = new Date().toISOString();

        await trx
          .insertInto('sale')
          .values({
            id: saleId,
            tenantId: this.tenantId,
            docNo,
            customerId: input.customerId,
            warehouseId,
            priceLevelId: customerPriceLevelId ?? defaultPriceLevel.id,
            saleDate: input.saleDate,
            saleType: 'counter',
            subtotal: subtotalPaisa,
            discountAmount: 0,
            taxAmount: 0,
            totalAmount: totalAmountPaisa,
            paidAmount: input.paidAmountPaisa,
            paymentMode: input.paymentMode,
            status: 'confirmed',
            notes: input.notes,
            createdAt: now,
            updatedAt: now,
            createdBy: null,
          })
          .execute();

        for (const line of computedLines) {
          await trx
            .insertInto('saleLine')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              saleId,
              lineNo: line.lineNo,
              itemId: line.itemId,
              // Snapshot of the item name at sale time — docs/DATABASE_RULES.md §3.
              description: line.nameEn,
              // The qty the customer bought, in whichever unit they bought
              // it in (sale_uom, or stock_uom when saleUomId is absent) —
              // never the stock-converted amount.
              quantity: line.quantityMilli,
              unitPrice: line.unitPricePaisa,
              unitCost: line.unitCostPaisa,
              discountAmount: 0,
              taxRate: 0,
              taxAmount: 0,
              lineTotal: line.lineTotalPaisa,
              businessUnitId: line.businessUnitId,
              saleUomId: line.saleUomId,
              saleToStockFactor: line.saleToStockFactor,
            })
            .execute();

          await trx
            .insertInto('stockMovement')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              itemId: line.itemId,
              warehouseId,
              movementDate: input.saleDate,
              movementType: 'sale',
              // Always in stock_uom milli-units — line.stockQuantityMilli
              // already applied the conversion, if any (ADR-0013).
              quantity: -line.stockQuantityMilli,
              unitCost: line.unitCostPaisa,
              serialId: null,
              sourceType: 'sale',
              sourceId: saleId,
              reason: null,
              reversedById: null,
              createdAt: now,
              createdBy: null,
              businessUnitId: line.businessUnitId,
            })
            .execute();
        }

        if (input.paymentMode === 'credit' && input.customerId) {
          // Outstanding amount, not necessarily the full total — supports
          // a partial payment taken at checkout. Positive: the customer
          // owes the shop more (CF-2's sign convention).
          const outstandingPaisa = totalAmountPaisa - input.paidAmountPaisa;
          await trx
            .insertInto('partyLedger')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              partyId: input.customerId,
              entryDate: input.saleDate,
              entryType: 'sale',
              amount: outstandingPaisa,
              runningNote: null,
              sourceType: 'sale',
              sourceId: saleId,
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
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'sale',
            recordId: saleId,
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
            tableName: 'sale',
            recordId: saleId,
            operation: 'insert',
            payload: null,
            createdAt: now,
            syncedAt: null,
            syncAttempts: 0,
            lastError: null,
          })
          .execute();

        return {
          id: saleId,
          docNo,
          totalAmountPaisa,
          warnings: { creditLimitExceeded, stockBelowZero, unitCostMissing },
        };
      }),
    );
  }

  async getSaleById(id: string): Promise<SaleRecord | null> {
    const sale = await this.db
      .selectFrom('sale')
      .select([
        'id',
        'docNo',
        'customerId',
        'warehouseId',
        'saleDate',
        'paymentMode',
        'totalAmount',
        'paidAmount',
        'status',
      ])
      .where('id', '=', id)
      .where('tenantId', '=', this.tenantId)
      .executeTakeFirst();

    if (!sale || !sale.paymentMode) return null;

    const lines = await this.db
      .selectFrom('saleLine')
      .select(['itemId', 'quantity', 'unitPrice', 'unitCost', 'lineTotal', 'businessUnitId'])
      .where('saleId', '=', id)
      .where('tenantId', '=', this.tenantId)
      .orderBy('lineNo', 'asc')
      .execute();

    const lineRecords: SaleLineRecord[] = lines.map((l) => ({
      itemId: l.itemId,
      quantityMilli: l.quantity,
      unitPricePaisa: l.unitPrice,
      unitCostPaisa: l.unitCost,
      lineTotalPaisa: l.lineTotal,
      businessUnitId: l.businessUnitId ?? '',
    }));

    return {
      id: sale.id,
      docNo: sale.docNo,
      customerId: sale.customerId,
      warehouseId: sale.warehouseId,
      saleDate: sale.saleDate,
      paymentMode: sale.paymentMode as 'cash' | 'credit',
      totalAmountPaisa: sale.totalAmount,
      paidAmountPaisa: sale.paidAmount,
      status: sale.status,
      lines: lineRecords,
    };
  }

  /** Plain filtered SELECT, most recent first — no business logic. */
  async listSalesByDate(query: SaleSearchQuery): Promise<readonly SaleSummaryRecord[]> {
    let q = this.db
      .selectFrom('sale')
      .select([
        'id',
        'docNo',
        'customerId',
        'saleDate',
        'paymentMode',
        'totalAmount',
        'paidAmount',
        'status',
      ])
      .where('tenantId', '=', this.tenantId);

    if (query.dateFrom) {
      q = q.where('saleDate', '>=', query.dateFrom);
    }
    if (query.dateTo) {
      q = q.where('saleDate', '<=', query.dateTo);
    }
    if (query.customerId) {
      q = q.where('customerId', '=', query.customerId);
    }
    if (query.status) {
      q = q.where('status', '=', query.status);
    }

    const rows = await q.orderBy('saleDate', 'desc').execute();
    return rows.map((row) => ({
      id: row.id,
      docNo: row.docNo,
      customerId: row.customerId,
      saleDate: row.saleDate,
      paymentMode: row.paymentMode,
      totalAmountPaisa: row.totalAmount,
      paidAmountPaisa: row.paidAmount,
      status: row.status,
    }));
  }

  /**
   * Reversal never sets reversed_by_id and never updates a
   * stock_movement/party_ledger row's substantive columns (CLAUDE.md
   * §3.3 / BUG-14's resolved reading — same mechanism as purchase
   * cancellation). sale.status IS updated: sale itself is not
   * append-only, only stock_movement and party_ledger are (ADR-0004).
   */
  async cancelSale(id: string): Promise<void> {
    await withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const sale = await trx
          .selectFrom('sale')
          .select(['id', 'status', 'paymentMode', 'customerId'])
          .where('id', '=', id)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!sale) {
          throw new Error(`Sale ${id} not found`);
        }
        if (sale.status === 'cancelled') {
          throw new Error(`Sale ${id} is already cancelled`);
        }

        const now = new Date().toISOString();

        const movements = await trx
          .selectFrom('stockMovement')
          .select(['itemId', 'warehouseId', 'quantity', 'unitCost', 'businessUnitId'])
          .where('tenantId', '=', this.tenantId)
          .where('sourceType', '=', 'sale')
          .where('sourceId', '=', id)
          .where('movementType', '=', 'sale')
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
              movementType: 'sale_return',
              quantity: -movement.quantity,
              unitCost: movement.unitCost,
              serialId: null,
              sourceType: 'sale',
              sourceId: id,
              reason: 'Sale cancelled',
              reversedById: null,
              createdAt: now,
              createdBy: null,
              businessUnitId: movement.businessUnitId,
            })
            .execute();
        }

        if (sale.paymentMode === 'credit' && sale.customerId) {
          const ledgerRow = await trx
            .selectFrom('partyLedger')
            .select(['amount'])
            .where('tenantId', '=', this.tenantId)
            .where('sourceType', '=', 'sale')
            .where('sourceId', '=', id)
            .where('entryType', '=', 'sale')
            .executeTakeFirst();
          if (!ledgerRow) {
            throw new Error(`Credit sale ${id} has no party_ledger row to reverse`);
          }

          await trx
            .insertInto('partyLedger')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              partyId: sale.customerId,
              entryDate: now,
              entryType: 'sale_return',
              amount: -ledgerRow.amount,
              runningNote: null,
              sourceType: 'sale',
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
          .updateTable('sale')
          .set({ status: 'cancelled', updatedAt: now })
          .where('id', '=', id)
          .where('tenantId', '=', this.tenantId)
          .execute();

        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'sale',
            recordId: id,
            action: 'update',
            changedFields: JSON.stringify({ status: 'cancelled' }),
            oldValues: JSON.stringify({ status: sale.status }),
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
            tableName: 'sale',
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
