import { Money, Qty, type Paisa, type Milli } from '@shop/shared';

/**
 * Pure, pdfkit-free receipt content — the exact string a receipt must
 * contain. P4-1b: one template, no page-size knowledge here (that's a
 * rendering concern, handled where pdfkit is actually called). CF-2:
 * unitName is always the sale UoM name (sale_uom_id joined at the
 * caller), never the stock UoM. CF-1: docNo is always PREFIX-NNNN.
 */
export interface ReceiptLineData {
  readonly itemName: string;
  readonly quantityMilli: number;
  readonly unitName: string;
  readonly unitPricePaisa: number;
  readonly lineTotalPaisa: number;
}

export interface ReceiptData {
  readonly docNo: string;
  readonly shopName: string;
  /** sale.created_at — sale_date alone carries no time component. */
  readonly saleDateTimeIso: string;
  readonly lines: readonly ReceiptLineData[];
  readonly grandTotalPaisa: number;
}

function formatDateTime(iso: string): string {
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  return `${date} ${time}`;
}

function formatLine(line: ReceiptLineData): string {
  const qty = Qty.format(line.quantityMilli as Milli, { unit: line.unitName });
  const unitPrice = Money.format(line.unitPricePaisa as Paisa);
  const lineTotal = Money.format(line.lineTotalPaisa as Paisa);
  return `${line.itemName} | ${qty} | ${unitPrice} | ${lineTotal}`;
}

export function buildReceiptLayout(data: ReceiptData): string {
  const header = [data.docNo, data.shopName, formatDateTime(data.saleDateTimeIso)];
  const lineItems = data.lines.map(formatLine);
  const footer = `Grand Total: ${Money.format(data.grandTotalPaisa as Paisa)}`;

  return [...header, '', ...lineItems, '', footer].join('\n');
}
