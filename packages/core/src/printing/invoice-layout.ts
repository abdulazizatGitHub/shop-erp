import { Money, Qty, type Paisa, type Milli } from '@shop/shared';
import type { ReceiptLineData } from './receipt-layout.js';

/** A print line plus the P6-10 fields needed for business-unit grouping. */
export interface InvoiceLineData extends ReceiptLineData {
  /** 'part' | 'labour' — see sale_line.line_kind (P6-5). */
  readonly lineKind: string;
  /** "Spare Parts" / "Repair", or null for a plain counter sale. */
  readonly businessUnitName: string | null;
}

/**
 * Pure, pdfkit-free invoice content — P4-2. Always A4, no page-size
 * parameter (unlike the receipt template). Reuses ReceiptLineData —
 * same reasoning as invoice.repository.ts reusing ReceiptSaleLine.
 */
export interface InvoiceLayoutData {
  readonly docNo: string;
  readonly saleDate: string;
  readonly customerName: string | null;
  readonly customerPhone: string | null;
  readonly customerAddress: string | null;
  readonly lines: readonly InvoiceLineData[];
  readonly totalAmountPaisa: number;
  readonly paidAmountPaisa: number;
  readonly balanceDuePaisa: number;
  /** P6-10: the job's own JOB-NNNN doc_no — null unless this invoice is a job delivery. */
  readonly jobDocNo: string | null;
  readonly reportedFault: string | null;
  readonly technicianName: string | null;
}

function formatLine(line: InvoiceLineData): string {
  const qty = Qty.format(line.quantityMilli as Milli, { unit: line.unitName });
  const unitPrice = Money.format(line.unitPricePaisa as Paisa);
  const lineTotal = Money.format(line.lineTotalPaisa as Paisa);
  return `${line.itemName} | ${qty} | ${unitPrice} | ${lineTotal}`;
}

/**
 * Groups lines by businessUnitName, in first-seen order, ONLY when at
 * least one line actually carries one — a plain counter sale's lines
 * never set sale_line.business_unit_id, so it stays a flat list exactly
 * as before P6-10 rather than printing a spurious single "null" group.
 */
function formatLines(lines: readonly InvoiceLineData[]): readonly string[] {
  if (lines.every((line) => line.businessUnitName === null)) {
    return lines.map(formatLine);
  }

  const order: string[] = [];
  const groups = new Map<string, InvoiceLineData[]>();
  for (const line of lines) {
    const key = line.businessUnitName ?? 'Other';
    if (!groups.has(key)) {
      order.push(key);
      groups.set(key, []);
    }
    groups.get(key)?.push(line);
  }

  return order.flatMap((key) => {
    const groupLines = groups.get(key) ?? [];
    return [`-- ${key} --`, ...groupLines.map(formatLine)];
  });
}

export function buildInvoiceLayout(data: InvoiceLayoutData): string {
  const header = [data.docNo, `Customer: ${data.customerName ?? 'Walk-in'}`];
  if (data.customerName !== null) {
    if (data.customerPhone !== null) header.push(`Phone: ${data.customerPhone}`);
    if (data.customerAddress !== null) header.push(`Address: ${data.customerAddress}`);
  }
  header.push(`Date: ${data.saleDate}`);
  if (data.jobDocNo !== null) {
    header.push(`Job: ${data.jobDocNo}`);
    if (data.reportedFault !== null) header.push(`Fault: ${data.reportedFault}`);
    header.push(`Technician: ${data.technicianName ?? 'Unassigned'}`);
  }

  const lineItems = formatLines(data.lines);

  const footer = [
    `Total: ${Money.format(data.totalAmountPaisa as Paisa)}`,
    `Paid: ${Money.format(data.paidAmountPaisa as Paisa)}`,
    `Balance Due: ${Money.format(data.balanceDuePaisa as Paisa)}`,
  ];

  return [...header, '', ...lineItems, '', ...footer].join('\n');
}
