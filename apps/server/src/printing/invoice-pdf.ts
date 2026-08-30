import { renderReceiptPdf } from './receipt-pdf.js';

/**
 * P4-2. Invoice is always A4 — no page-size parameter, unlike the
 * receipt. Deliberately reuses renderReceiptPdf (the same pdfkit code
 * path) rather than duplicating the drawing logic — a thin, named
 * wrapper only so call sites are unambiguous about which document
 * type they're generating.
 */
export function renderInvoicePdf(layoutText: string): Promise<Buffer> {
  return renderReceiptPdf(layoutText, 'A4');
}
