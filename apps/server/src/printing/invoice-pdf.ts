import { renderReceiptPdf, type ReceiptPageSize } from './receipt-pdf.js';

/**
 * P4-2, rewired P17-5 (docs/phases/PHASE_17.md §2.9, S17-PRINT-2a) —
 * now takes a page-size parameter instead of hardcoding 'A4', same
 * shape as the receipt's own renderReceiptPdf(layoutText, pageSize).
 * Deliberately reuses renderReceiptPdf (the same pdfkit code path)
 * rather than duplicating the drawing logic — a thin, named wrapper
 * only so call sites are unambiguous about which document type
 * they're generating.
 */
export function renderInvoicePdf(layoutText: string, pageSize: ReceiptPageSize): Promise<Buffer> {
  return renderReceiptPdf(layoutText, pageSize);
}
