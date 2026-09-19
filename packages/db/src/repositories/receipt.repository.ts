import { sql, type Kysely } from 'kysely';
import type { ShopIdentity } from '@shop/core';
import type { Database } from '../kysely-schema.js';
import { getShopIdentity } from './shop-identity.repository.js';
import { getCustomerLedger } from './customer-ledger.repository.js';

// P4-1c. Read model for printing — sits alongside report.repository.ts
// but is not one of the P4-3 reports. sl.description is the item-name
// SNAPSHOT taken at sale time (see sale.repository.ts createSale,
// docs/DATABASE_RULES.md "Snapshots") — deliberately NOT joined to the
// live item table for the name, since a later item rename must not
// change a historical receipt. The UoM name DOES need a live join
// (CF-2): sale_uom_id when the line was sold in an alt unit, falling
// back to the item's stock UoM when it was sold in stock_uom (NULL
// sale_uom_id) — both are themselves permanent per-line/per-item
// references, not something that drifts the way a display name would.

export interface ReceiptSaleLine {
  readonly itemName: string;
  readonly quantityMilli: number;
  readonly unitName: string;
  readonly unitPricePaisa: number;
  readonly lineTotalPaisa: number;
  /** 'part' | 'labour' — see sale_line.line_kind (P6-5). */
  readonly lineKind: string;
  /** Resolved business_unit.name ("Spare Parts"/"Repair"), or null for a
   * plain counter sale, whose lines never carry a business_unit_id. */
  readonly businessUnitName: string | null;
}

export interface ReceiptSaleData {
  readonly docNo: string;
  readonly createdAt: string;
  readonly totalAmountPaisa: number;
  readonly lines: readonly ReceiptSaleLine[];
}

export async function getSaleReceiptData(
  db: Kysely<Database>,
  tenantId: string,
  saleId: string,
): Promise<ReceiptSaleData | null> {
  const saleHeader = await db
    .selectFrom('sale')
    .select(['docNo', 'createdAt', 'totalAmount'])
    .where('id', '=', saleId)
    .where('tenantId', '=', tenantId)
    .executeTakeFirst();

  if (!saleHeader) return null;

  const lineResult = await sql<{
    itemName: string | null;
    quantityMilli: number;
    unitName: string | null;
    unitPricePaisa: number;
    lineTotalPaisa: number;
    lineKind: string;
    businessUnitName: string | null;
  }>`
    SELECT
      sl.description                              AS itemName,
      sl.quantity                                 AS quantityMilli,
      COALESCE(u_sale.name, u_stock.name)         AS unitName,
      sl.unit_price                               AS unitPricePaisa,
      sl.line_total                               AS lineTotalPaisa,
      sl.line_kind                                AS lineKind,
      bu.name                                     AS businessUnitName
    FROM        sale_line sl
    LEFT JOIN   item i ON i.id = sl.item_id
    LEFT JOIN   uom u_sale ON u_sale.id = sl.sale_uom_id
    LEFT JOIN   uom u_stock ON u_stock.id = i.stock_uom_id
    LEFT JOIN   business_unit bu ON bu.id = sl.business_unit_id
    WHERE       sl.sale_id = ${saleId} AND sl.tenant_id = ${tenantId}
    ORDER BY    sl.line_no
  `.execute(db);

  return {
    docNo: saleHeader.docNo,
    createdAt: saleHeader.createdAt,
    totalAmountPaisa: saleHeader.totalAmount,
    lines: lineResult.rows.map((row) => ({
      itemName: row.itemName ?? '(unknown item)',
      quantityMilli: row.quantityMilli,
      // '' for a labour line, which has neither a sale_uom_id nor an item
      // to fall back to — buildInvoiceLayout/buildReceiptLayout both treat
      // an empty unit as "omit the unit suffix" (Qty.format).
      unitName: row.unitName ?? '',
      unitPricePaisa: row.unitPricePaisa,
      lineTotalPaisa: row.lineTotalPaisa,
      lineKind: row.lineKind,
      businessUnitName: row.businessUnitName,
    })),
  };
}

export interface PaymentReceiptData {
  readonly docNo: string;
  readonly paymentDate: string;
  readonly amountPaisa: number;
  readonly method: string;
  readonly referenceNo: string | null;
  readonly notes: string | null;
  readonly customerName: string;
  readonly customerCode: string;
  readonly customerPhone: string | null;
  readonly shopIdentity: ShopIdentity;
  readonly previousBalancePaisa: number;
  readonly remainingBalancePaisa: number;
}

interface PaymentHeaderRow {
  docNo: string;
  paymentDate: string;
  amount: number;
  method: string;
  referenceNo: string | null;
  notes: string | null;
  partyId: string;
}

interface PaymentCustomerRow {
  name: string;
  partyCode: string;
  phone: string | null;
}

/**
 * CL-7A. previousBalancePaisa/remainingBalancePaisa come from the same
 * window-function ledger query getCustomerLedger already runs — composed,
 * not re-derived, so the two documents can never disagree on a balance.
 */
export async function getPaymentReceiptData(
  db: Kysely<Database>,
  tenantId: string,
  paymentId: string,
): Promise<PaymentReceiptData | null> {
  const paymentHeader = (await db
    .selectFrom('payment')
    .select(['docNo', 'paymentDate', 'amount', 'method', 'referenceNo', 'notes', 'partyId'])
    .where('id', '=', paymentId)
    .where('tenantId', '=', tenantId)
    .executeTakeFirst()) as PaymentHeaderRow | undefined;

  if (!paymentHeader) return null;

  const customerRow = (await db
    .selectFrom('party')
    .select(['name', 'partyCode', 'phone'])
    .where('id', '=', paymentHeader.partyId)
    .where('tenantId', '=', tenantId)
    .executeTakeFirst()) as PaymentCustomerRow | undefined;

  const shopIdentity = await getShopIdentity(db, tenantId);
  const ledger = await getCustomerLedger(db, tenantId, paymentHeader.partyId);
  const ledgerRow = ledger.find(
    (row) => row.sourceType === 'payment' && row.sourceId === paymentId,
  );

  const remainingBalancePaisa = ledgerRow?.runningBalancePaisa ?? 0;
  // amountPaisa on the ledger row is negative for a payment, so this adds
  // the payment amount back to reach the balance BEFORE it was applied.
  const previousBalancePaisa = remainingBalancePaisa - (ledgerRow?.amountPaisa ?? 0);

  return {
    docNo: paymentHeader.docNo,
    paymentDate: paymentHeader.paymentDate,
    amountPaisa: paymentHeader.amount,
    method: paymentHeader.method,
    referenceNo: paymentHeader.referenceNo,
    notes: paymentHeader.notes,
    customerName: customerRow?.name ?? '(unknown customer)',
    customerCode: customerRow?.partyCode ?? '',
    customerPhone: customerRow?.phone ?? null,
    shopIdentity,
    previousBalancePaisa,
    remainingBalancePaisa,
  };
}
