import { Money, Qty, type Paisa, type Milli } from '@shop/shared';
import type { ReceiptLineData } from './receipt-layout.js';

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
  readonly lines: readonly ReceiptLineData[];
  readonly totalAmountPaisa: number;
  readonly paidAmountPaisa: number;
  readonly balanceDuePaisa: number;
}

function formatLine(line: ReceiptLineData): string {
  const qty = Qty.format(line.quantityMilli as Milli, { unit: line.unitName });
  const unitPrice = Money.format(line.unitPricePaisa as Paisa);
  const lineTotal = Money.format(line.lineTotalPaisa as Paisa);
  return `${line.itemName} | ${qty} | ${unitPrice} | ${lineTotal}`;
}

export function buildInvoiceLayout(data: InvoiceLayoutData): string {
  const header = [data.docNo, `Customer: ${data.customerName ?? 'Walk-in'}`];
  if (data.customerName !== null) {
    if (data.customerPhone !== null) header.push(`Phone: ${data.customerPhone}`);
    if (data.customerAddress !== null) header.push(`Address: ${data.customerAddress}`);
  }
  header.push(`Date: ${data.saleDate}`);

  const lineItems = data.lines.map(formatLine);

  const footer = [
    `Total: ${Money.format(data.totalAmountPaisa as Paisa)}`,
    `Paid: ${Money.format(data.paidAmountPaisa as Paisa)}`,
    `Balance Due: ${Money.format(data.balanceDuePaisa as Paisa)}`,
  ];

  return [...header, '', ...lineItems, '', ...footer].join('\n');
}
