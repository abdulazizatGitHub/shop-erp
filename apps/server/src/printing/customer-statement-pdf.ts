import { Money, type Paisa } from '@shop/shared';
import { buildCustomerStatementLayout } from '@shop/core';
import type { CustomerStatementRecord } from '@shop/db';
import { renderReceiptPdf } from './receipt-pdf.js';

/** CL-8C. Reuses renderReceiptPdf's pdfkit drawing, same as payment-receipt-pdf.ts. Always A4. */
export function renderCustomerStatementPdf(data: CustomerStatementRecord): Promise<Buffer> {
  const layout = buildCustomerStatementLayout(data);

  const lines = [
    layout.shopSection.name,
    ...(layout.shopSection.phone !== null ? [layout.shopSection.phone] : []),
    ...(layout.shopSection.address !== null ? [layout.shopSection.address] : []),
    '',
    layout.title,
    `Customer: ${layout.customerSection.name} (${layout.customerSection.code})`,
    ...(layout.customerSection.phone !== null ? [layout.customerSection.phone] : []),
    layout.period,
    '',
    `Balance brought forward: ${Money.format(layout.openingBalancePaisa as Paisa)}`,
    '',
    ...layout.rows.map((row) => {
      const debit = row.debitPaisa !== null ? Money.format(row.debitPaisa as Paisa) : '—';
      const credit = row.creditPaisa !== null ? Money.format(row.creditPaisa as Paisa) : '—';
      const balanceText = Money.format(row.balancePaisa as Paisa);
      return `${row.date} | ${row.type} | ${row.reference} | ${debit} | ${credit} | ${balanceText}`;
    }),
    '',
    `Closing balance: ${Money.format(layout.closingBalancePaisa as Paisa)}`,
    ...(layout.footerText !== null ? ['', layout.footerText] : []),
  ];

  return renderReceiptPdf(lines.join('\n'), 'A4');
}
