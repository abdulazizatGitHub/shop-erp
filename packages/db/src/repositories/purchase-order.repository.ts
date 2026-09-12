import { sql, type Kysely } from 'kysely';
import { formatDisplayDocNumber, newId } from '@shop/shared';
import {
  PurchaseOrderAlreadyCancelledError,
  PurchaseOrderHasGrnsError,
  PurchaseOrderNotFoundError,
  type NewPurchaseOrderInput,
  type NewPurchaseOrderResult,
  type PurchaseOrderLineRecord,
  type PurchaseOrderRecord,
  type PurchaseOrderRepositoryPort,
  type PurchaseOrderStatus,
  type PurchaseOrderSummary,
} from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

const PURCHASE_ORDER_DOC_TYPE = 'purchase_order';
const PURCHASE_ORDER_PREFIX = 'PO';

export class KyselyPurchaseOrderRepository implements PurchaseOrderRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  private async nextPurchaseOrderDocNo(trx: Kysely<Database>): Promise<string> {
    const existing = await trx
      .selectFrom('documentSequence')
      .select('nextNumber')
      .where('tenantId', '=', this.tenantId)
      .where('docType', '=', PURCHASE_ORDER_DOC_TYPE)
      .where('deviceCode', '=', this.deviceCode)
      .executeTakeFirst();

    const nextNumber = existing?.nextNumber ?? 1;

    if (existing) {
      await trx
        .updateTable('documentSequence')
        .set({ nextNumber: nextNumber + 1 })
        .where('tenantId', '=', this.tenantId)
        .where('docType', '=', PURCHASE_ORDER_DOC_TYPE)
        .where('deviceCode', '=', this.deviceCode)
        .execute();
    } else {
      await trx
        .insertInto('documentSequence')
        .values({
          tenantId: this.tenantId,
          docType: PURCHASE_ORDER_DOC_TYPE,
          prefix: PURCHASE_ORDER_PREFIX,
          deviceCode: this.deviceCode,
          nextNumber: 2,
        })
        .execute();
    }

    return formatDisplayDocNumber(PURCHASE_ORDER_PREFIX, nextNumber);
  }

  async create(input: NewPurchaseOrderInput): Promise<NewPurchaseOrderResult> {
    if (input.lines.length === 0) {
      throw new Error('A purchase order must have at least one line');
    }

    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const docNo = await this.nextPurchaseOrderDocNo(trx);
        const purchaseOrderId = newId();
        const now = new Date().toISOString();

        await trx
          .insertInto('purchaseOrder')
          .values({
            id: purchaseOrderId,
            tenantId: this.tenantId,
            docNo,
            supplierPartyId: input.supplierPartyId,
            supplierNote: input.supplierNote,
            orderDate: input.orderDate,
            expectedDelivery: input.expectedDelivery,
            notes: input.notes,
            status: 'draft',
            createdAt: now,
            updatedAt: now,
          })
          .execute();

        for (const line of input.lines) {
          await trx
            .insertInto('purchaseOrderLine')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              purchaseOrderId,
              itemId: line.itemId,
              quantityOrderedMilli: line.quantityOrderedMilli,
              quantityReceivedMilli: 0,
              notes: line.notes,
            })
            .execute();
        }

        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'purchase_order',
            recordId: purchaseOrderId,
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
            tableName: 'purchase_order',
            recordId: purchaseOrderId,
            operation: 'insert',
            payload: null,
            createdAt: now,
            syncedAt: null,
            syncAttempts: 0,
            lastError: null,
          })
          .execute();

        return { id: purchaseOrderId, docNo };
      }),
    );
  }

  async get(id: string): Promise<PurchaseOrderRecord | null> {
    const po = await this.db
      .selectFrom('purchaseOrder')
      .select([
        'id',
        'docNo',
        'supplierPartyId',
        'supplierNote',
        'orderDate',
        'expectedDelivery',
        'notes',
        'status',
      ])
      .where('id', '=', id)
      .where('tenantId', '=', this.tenantId)
      .executeTakeFirst();

    if (!po) return null;

    const lines = await this.db
      .selectFrom('purchaseOrderLine')
      .select(['id', 'itemId', 'quantityOrderedMilli', 'quantityReceivedMilli', 'notes'])
      .where('purchaseOrderId', '=', id)
      .where('tenantId', '=', this.tenantId)
      .execute();

    const lineRecords: PurchaseOrderLineRecord[] = lines.map((l) => ({
      id: l.id,
      itemId: l.itemId,
      quantityOrderedMilli: l.quantityOrderedMilli,
      quantityReceivedMilli: l.quantityReceivedMilli,
      notes: l.notes,
    }));

    return {
      id: po.id,
      docNo: po.docNo,
      supplierPartyId: po.supplierPartyId,
      supplierNote: po.supplierNote,
      orderDate: po.orderDate,
      expectedDelivery: po.expectedDelivery,
      notes: po.notes,
      status: po.status as PurchaseOrderStatus,
      lines: lineRecords,
    };
  }

  async list(): Promise<readonly PurchaseOrderSummary[]> {
    const rows = await this.db
      .selectFrom('purchaseOrder as po')
      .leftJoin('party', (join) =>
        join.onRef('party.id', '=', 'po.supplierPartyId').on('party.tenantId', '=', this.tenantId),
      )
      .leftJoin('purchaseOrderLine as pol', (join) =>
        join.onRef('pol.purchaseOrderId', '=', 'po.id').on('pol.tenantId', '=', this.tenantId),
      )
      .select([
        'po.id as id',
        'po.docNo as docNo',
        'party.name as supplierName',
        'po.orderDate as orderDate',
        'po.status as status',
        (eb) => eb.fn.count<number>('pol.id').as('lineCount'),
        sql<number>`coalesce(sum(pol.quantity_ordered_milli), 0)`.as('totalOrderedMilli'),
        sql<number>`coalesce(sum(pol.quantity_received_milli), 0)`.as('totalReceivedMilli'),
      ])
      .where('po.tenantId', '=', this.tenantId)
      .where('po.status', '!=', 'cancelled')
      .groupBy(['po.id', 'po.docNo', 'party.name', 'po.orderDate', 'po.status', 'po.createdAt'])
      .orderBy('po.createdAt', 'desc')
      .execute();

    return rows.map((row): PurchaseOrderSummary => ({
      id: row.id,
      docNo: row.docNo,
      supplierName: row.supplierName,
      orderDate: row.orderDate,
      status: row.status as PurchaseOrderStatus,
      lineCount: row.lineCount,
      totalOrderedMilli: row.totalOrderedMilli,
      totalReceivedMilli: row.totalReceivedMilli,
    }));
  }

  async updateStatus(id: string, status: PurchaseOrderStatus): Promise<void> {
    await this.db
      .updateTable('purchaseOrder')
      .set({ status, updatedAt: new Date().toISOString() })
      .where('id', '=', id)
      .where('tenantId', '=', this.tenantId)
      .execute();
  }

  async cancel(id: string): Promise<void> {
    await withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const po = await trx
          .selectFrom('purchaseOrder')
          .select(['id', 'status'])
          .where('id', '=', id)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!po) {
          throw new PurchaseOrderNotFoundError(id);
        }
        if (po.status === 'cancelled') {
          throw new PurchaseOrderAlreadyCancelledError(id);
        }

        const confirmedGrns = await trx
          .selectFrom('grn')
          .select((eb) => eb.fn.count<number>('id').as('count'))
          .where('tenantId', '=', this.tenantId)
          .where('purchaseOrderId', '=', id)
          .where('status', '=', 'confirmed')
          .executeTakeFirstOrThrow();
        if (confirmedGrns.count > 0) {
          throw new PurchaseOrderHasGrnsError(id);
        }

        const now = new Date().toISOString();

        await trx
          .updateTable('purchaseOrder')
          .set({ status: 'cancelled', updatedAt: now })
          .where('id', '=', id)
          .where('tenantId', '=', this.tenantId)
          .execute();

        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'purchase_order',
            recordId: id,
            action: 'update',
            changedFields: JSON.stringify({ status: 'cancelled' }),
            oldValues: JSON.stringify({ status: po.status }),
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
            tableName: 'purchase_order',
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
