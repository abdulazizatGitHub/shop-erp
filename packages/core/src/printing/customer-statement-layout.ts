import type { ShopIdentity } from '../shop/shop-identity.js';

/**
 * CL-8B. Pure, pdfkit-free structured content for the customer statement
 * PDF (CL-8C draws from this). Trivial string/number mapping — no tests
 * required per the phase spec.
 *
 * Row/customer shape mirrors packages/db's CustomerStatementRecord
 * structurally — packages/core has no dependency on packages/db.
 */
export interface CustomerStatementRowInput {
  readonly entryDate: string;
  readonly entryType: string;
  readonly saleDocNo: string | null;
  readonly paymentDocNo: string | null;
  readonly billReference: string | null;
  readonly amountPaisa: number;
  readonly runningBalancePaisa: number;
}

export interface CustomerStatementLayoutInput {
  readonly customer: {
    readonly name: string;
    readonly code: string;
    readonly phone: string | null;
  };
  readonly shopIdentity: ShopIdentity;
  readonly fromDate: string;
  readonly toDate: string;
  readonly openingBalancePaisa: number;
  readonly rows: readonly CustomerStatementRowInput[];
  readonly closingBalancePaisa: number;
}

export interface CustomerStatementLayoutRow {
  readonly date: string;
  readonly type: string;
  readonly reference: string;
  readonly debitPaisa: number | null;
  readonly creditPaisa: number | null;
  readonly balancePaisa: number;
}

export interface CustomerStatementLayoutData {
  readonly shopSection: {
    readonly name: string;
    readonly phone: string | null;
    readonly address: string | null;
  };
  readonly title: string;
  readonly customerSection: {
    readonly name: string;
    readonly code: string;
    readonly phone: string | null;
  };
  readonly period: string;
  readonly openingBalancePaisa: number;
  readonly rows: readonly CustomerStatementLayoutRow[];
  readonly closingBalancePaisa: number;
  readonly footerText: string | null;
}

export function buildCustomerStatementLayout(
  data: CustomerStatementLayoutInput,
): CustomerStatementLayoutData {
  return {
    shopSection: {
      name: data.shopIdentity.shopName,
      phone: data.shopIdentity.shopPhone,
      address: data.shopIdentity.shopAddress,
    },
    title: 'Account Statement',
    customerSection: data.customer,
    period: `From ${data.fromDate} to ${data.toDate}`,
    openingBalancePaisa: data.openingBalancePaisa,
    rows: data.rows.map((row) => ({
      date: row.entryDate,
      type: row.entryType,
      reference: row.saleDocNo ?? row.paymentDocNo ?? row.billReference ?? '—',
      debitPaisa: row.amountPaisa > 0 ? row.amountPaisa : null,
      creditPaisa: row.amountPaisa < 0 ? Math.abs(row.amountPaisa) : null,
      balancePaisa: row.runningBalancePaisa,
    })),
    closingBalancePaisa: data.closingBalancePaisa,
    footerText: data.shopIdentity.statementFooterText,
  };
}
