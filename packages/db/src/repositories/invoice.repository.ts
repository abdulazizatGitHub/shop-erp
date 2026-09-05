import type { Kysely } from 'kysely';
import { Money } from '@shop/shared';
import type { Database } from '../kysely-schema.js';
// Reuses ReceiptSaleLine from receipt.repository.ts — both describe a
// sale line as displayed to the customer (sale UoM, description
// snapshot). If the two shapes ever diverge, define InvoiceSaleLine
// separately.
import { getSaleReceiptData, type ReceiptSaleLine } from './receipt.repository.js';

export interface InvoiceData {
  readonly docNo: string;
  readonly saleDate: string;
  readonly customerName: string | null;
  readonly customerPhone: string | null;
  readonly customerAddress: string | null;
  readonly lines: readonly ReceiptSaleLine[];
  readonly totalAmountPaisa: number;
  readonly paidAmountPaisa: number;
  readonly balanceDuePaisa: number;
  /** The job's own JOB-NNNN doc_no (distinct from this invoice's INV-NNNN
   * docNo above) — null unless this sale came from a job delivery (P6-5). */
  readonly jobDocNo: string | null;
  readonly reportedFault: string | null;
  readonly technicianName: string | null;
}

interface SaleHeaderRow {
  saleDate: string;
  paidAmount: number;
  customerId: string | null;
  jobId: string | null;
}

interface CustomerRow {
  name: string;
  phone: string | null;
  address: string | null;
}

interface JobHeaderRow {
  docNo: string;
  reportedFault: string | null;
  assignedTo: string | null;
}

/**
 * P4-2. Extends getSaleReceiptData (docNo/lines/totalAmountPaisa reused
 * directly, not re-derived) with the additional fields an A4 wholesale
 * invoice needs that a receipt does not: sale date, customer name/
 * phone/address, amount paid, and balance due. Deliberately a
 * purpose-built read here rather than widening party.repository.ts's
 * CustomerRecord/getCustomerById — same reasoning getSaleReceiptData
 * itself used against sale.repository.ts's getSaleById/SaleRecord in
 * P4-1c: a narrow, invoice-specific shape, not a change to an
 * already-shipped, already-tested type.
 */
export async function getSaleInvoiceData(
  db: Kysely<Database>,
  tenantId: string,
  saleId: string,
): Promise<InvoiceData | null> {
  const receiptData = await getSaleReceiptData(db, tenantId, saleId);
  if (!receiptData) return null;

  const saleHeader = (await db
    .selectFrom('sale')
    .select(['saleDate', 'paidAmount', 'customerId', 'jobId'])
    .where('id', '=', saleId)
    .where('tenantId', '=', tenantId)
    .executeTakeFirst()) as SaleHeaderRow | undefined;

  // Cannot happen in practice — getSaleReceiptData already confirmed the
  // sale exists — but keeps this function honest about its own return type.
  if (!saleHeader) return null;

  let customerName: string | null = null;
  let customerPhone: string | null = null;
  let customerAddress: string | null = null;

  if (saleHeader.customerId !== null) {
    const customerRow = (await db
      .selectFrom('party')
      .select(['name', 'phone', 'address'])
      .where('id', '=', saleHeader.customerId)
      .where('tenantId', '=', tenantId)
      .executeTakeFirst()) as CustomerRow | undefined;

    if (customerRow) {
      customerName = customerRow.name;
      customerPhone = customerRow.phone;
      customerAddress = customerRow.address;
    }
  }

  const balanceDuePaisa = Money.subtract(
    Money.of(receiptData.totalAmountPaisa),
    Money.of(saleHeader.paidAmount),
  );

  let jobDocNo: string | null = null;
  let reportedFault: string | null = null;
  let technicianName: string | null = null;

  if (saleHeader.jobId !== null) {
    const jobRow = (await db
      .selectFrom('job')
      .select(['docNo', 'reportedFault', 'assignedTo'])
      .where('id', '=', saleHeader.jobId)
      .where('tenantId', '=', tenantId)
      .executeTakeFirst()) as JobHeaderRow | undefined;

    if (jobRow) {
      jobDocNo = jobRow.docNo;
      reportedFault = jobRow.reportedFault;

      if (jobRow.assignedTo !== null) {
        const technicianRow = await db
          .selectFrom('party')
          .select('name')
          .where('id', '=', jobRow.assignedTo)
          .where('tenantId', '=', tenantId)
          .executeTakeFirst();
        technicianName = technicianRow?.name ?? null;
      }
    }
  }

  return {
    docNo: receiptData.docNo,
    saleDate: saleHeader.saleDate,
    customerName,
    customerPhone,
    customerAddress,
    lines: receiptData.lines,
    totalAmountPaisa: receiptData.totalAmountPaisa,
    paidAmountPaisa: saleHeader.paidAmount,
    balanceDuePaisa,
    jobDocNo,
    reportedFault,
    technicianName,
  };
}
