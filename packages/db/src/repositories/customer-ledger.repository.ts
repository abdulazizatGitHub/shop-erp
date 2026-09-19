import { sql, type Kysely } from 'kysely';
import type { ShopIdentity } from '@shop/core';
import type { Database } from '../kysely-schema.js';
import { getShopIdentity } from './shop-identity.repository.js';

// CL-1. party.repository.ts is already 568 lines (over the 260-line
// extend-in-place threshold used elsewhere this phase), so this is a
// new file rather than another method on KyselyPartyRepository — plain
// reference-data read, same reasoning lookup.repository.ts's comment
// gives for skipping the core port/service pattern.

export interface CustomerLedgerRowRecord {
  readonly id: string;
  readonly entryDate: string;
  readonly entryType: string;
  readonly amountPaisa: number;
  readonly runningBalancePaisa: number;
  readonly billReference: string | null;
  readonly billNotes: string | null;
  readonly sourceType: string | null;
  readonly sourceId: string | null;
  readonly saleDocNo: string | null;
  readonly saleTotalPaisa: number | null;
  readonly salePaidPaisa: number | null;
  readonly saleDiscountPaisa: number | null;
  readonly saleStatus: string | null;
  readonly salePaymentMode: string | null;
  readonly paymentDocNo: string | null;
  readonly paymentAmountPaisa: number | null;
  readonly paymentMethod: string | null;
  readonly paymentReferenceNo: string | null;
}

interface LedgerRow {
  id: string;
  entryDate: string;
  entryType: string;
  amountPaisa: number;
  runningBalancePaisa: number;
  billReference: string | null;
  billNotes: string | null;
  sourceType: string | null;
  sourceId: string | null;
  saleDocNo: string | null;
  saleTotalPaisa: number | null;
  salePaidPaisa: number | null;
  saleDiscountPaisa: number | null;
  saleStatus: string | null;
  salePaymentMode: string | null;
  paymentDocNo: string | null;
  paymentAmountPaisa: number | null;
  paymentMethod: string | null;
  paymentReferenceNo: string | null;
}

/**
 * Shared by getCustomerLedger and getCustomerStatementData's rows — the
 * window function always computes the running balance over ALL of the
 * party's rows (never just the filtered range), then the date filter
 * narrows which rows come back. dateFrom/dateTo are inclusive.
 */
async function queryCustomerLedger(
  db: Kysely<Database>,
  tenantId: string,
  customerId: string,
  dateRange?: { readonly fromDate: string; readonly toDate: string },
): Promise<readonly CustomerLedgerRowRecord[]> {
  const dateFilter = dateRange
    ? sql`AND sortEntryDate >= ${dateRange.fromDate} AND sortEntryDate <= ${dateRange.toDate}`
    : sql``;

  const result = await sql<LedgerRow>`
    SELECT * FROM (
      SELECT
        pl.id                                        AS id,
        pl.entry_date                                AS entryDate,
        pl.entry_type                                AS entryType,
        pl.amount                                     AS amountPaisa,
        pl.bill_reference                            AS billReference,
        pl.bill_notes                                AS billNotes,
        pl.source_type                               AS sourceType,
        pl.source_id                                 AS sourceId,

        s.doc_no                                     AS saleDocNo,
        s.total_amount                               AS saleTotalPaisa,
        s.paid_amount                                AS salePaidPaisa,
        s.discount_amount                            AS saleDiscountPaisa,
        s.status                                     AS saleStatus,
        s.payment_mode                               AS salePaymentMode,

        pay.doc_no                                   AS paymentDocNo,
        pay.amount                                   AS paymentAmountPaisa,
        pay.method                                   AS paymentMethod,
        pay.reference_no                             AS paymentReferenceNo,

        SUM(pl.amount) OVER (
          PARTITION BY pl.party_id
          ORDER BY pl.entry_date ASC, pl.id ASC
        )                                             AS runningBalancePaisa,
        pl.entry_date AS sortEntryDate,
        pl.id AS sortId

      FROM        party_ledger pl
      LEFT JOIN   sale s ON pl.source_type = 'sale' AND pl.source_id = s.id
      LEFT JOIN   payment pay ON pl.source_type = 'payment' AND pl.source_id = pay.id

      WHERE       pl.party_id = ${customerId} AND pl.tenant_id = ${tenantId}
    )
    WHERE 1=1 ${dateFilter}
    ORDER BY    sortEntryDate DESC, sortId DESC
  `.execute(db);

  return result.rows;
}

/**
 * Full ledger for one customer, newest first, with a running balance
 * computed by a window function over ALL of the party's rows in date
 * order — one query pass, no application-layer accumulation loop.
 */
export async function getCustomerLedger(
  db: Kysely<Database>,
  tenantId: string,
  customerId: string,
): Promise<readonly CustomerLedgerRowRecord[]> {
  return queryCustomerLedger(db, tenantId, customerId);
}

export interface CustomerStatementCustomer {
  readonly name: string;
  readonly code: string;
  readonly phone: string | null;
}

export interface CustomerStatementRecord {
  readonly customer: CustomerStatementCustomer;
  readonly shopIdentity: ShopIdentity;
  readonly fromDate: string;
  readonly toDate: string;
  readonly openingBalancePaisa: number;
  readonly rows: readonly CustomerLedgerRowRecord[];
  readonly closingBalancePaisa: number;
}

interface OpeningBalanceRow {
  openingBalancePaisa: number | null;
}

/**
 * CL-8A. openingBalancePaisa is a separate SUM query over ALL rows
 * strictly before fromDate — it must not depend on the date-filtered
 * rows or the page/filter the ledger view happens to be showing.
 */
export async function getCustomerStatementData(
  db: Kysely<Database>,
  tenantId: string,
  customerId: string,
  fromDate: string,
  toDate: string,
): Promise<CustomerStatementRecord | null> {
  const customerRow = (await db
    .selectFrom('party')
    .select(['name', 'partyCode', 'phone'])
    .where('id', '=', customerId)
    .where('tenantId', '=', tenantId)
    .executeTakeFirst()) as { name: string; partyCode: string; phone: string | null } | undefined;

  if (!customerRow) return null;

  const openingRow = (await sql<OpeningBalanceRow>`
    SELECT SUM(amount) AS openingBalancePaisa
    FROM party_ledger
    WHERE party_id = ${customerId} AND tenant_id = ${tenantId} AND entry_date < ${fromDate}
  `.execute(db)) as { rows: OpeningBalanceRow[] };

  const openingBalancePaisa = openingRow.rows[0]?.openingBalancePaisa ?? 0;
  const rows = await queryCustomerLedger(db, tenantId, customerId, { fromDate, toDate });
  const rowsSum = rows.reduce((sum, row) => sum + row.amountPaisa, 0);
  const shopIdentity = await getShopIdentity(db, tenantId);

  return {
    customer: { name: customerRow.name, code: customerRow.partyCode, phone: customerRow.phone },
    shopIdentity,
    fromDate,
    toDate,
    openingBalancePaisa,
    rows,
    closingBalancePaisa: openingBalancePaisa + rowsSum,
  };
}
