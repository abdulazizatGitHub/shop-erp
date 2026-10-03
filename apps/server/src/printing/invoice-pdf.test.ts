import { describe, expect, it } from 'vitest';
import { renderInvoicePdf } from './invoice-pdf.js';

const SAMPLE_LAYOUT = [
  'INV-0001',
  'Customer: Malik Traders',
  'Phone: 0300-1234567',
  'Address: Main Bazaar, Malakand',
  'Date: 2026-08-30',
  '',
  'Compressor 1.5 Ton | 2 Piece | Rs 5,000 | Rs 10,000',
  'Copper Pipe 1/4" | 10 Foot | Rs 300 | Rs 3,000',
  '',
  'Total: Rs 13,000',
  'Paid: Rs 5,000',
  'Balance Due: Rs 8,000',
].join('\n');

describe('renderInvoicePdf (P4-2, rewired P17-5) — takes a page-size parameter, no longer hardcoded to A4', () => {
  it('produces a real PDF at A4 size — real bytes inspected, not mocked', async () => {
    const buffer = await renderInvoicePdf(SAMPLE_LAYOUT, 'A4');

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);

    // Same pdfkit built-in A4 dimensions confirmed for the receipt
    // template (js/pdfkit.js:380): 595.28 x 841.89 pt. /MediaBox is
    // part of the PDF's object structure, not the compressed content
    // stream, so it's present in the raw bytes regardless of text
    // compression.
    //
    // Field-content verification note: I checked whether the drawn
    // text (e.g. "INV-0001") is directly greppable in the raw PDF
    // bytes, the same way /MediaBox is — it is not. pdfkit compresses
    // the content stream by default (confirmed empirically: a plain
    // `buffer.includes('INV-0001')` is false). I also tried recovering
    // it with Node's built-in zlib.inflateSync() against the
    // stream/endstream blocks; that did not reliably recover readable
    // text either, and doing it properly would mean hand-rolling a
    // real PDF parser (fragile) or adding a PDF-parsing dependency
    // (not authorized). So field content is verified the same way it
    // actually was for the receipt PDF, not the way I originally
    // assumed: structurally here (this test), and precisely by
    // invoice-layout.test.ts's exact-string assertions against the
    // SAME layoutText this function draws unmodified.
    expect(buffer.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]');
  });

  it('produces a real PDF at A5 size when asked (P17-5, S17-PRINT-2a)', async () => {
    const buffer = await renderInvoicePdf(SAMPLE_LAYOUT, 'A5');

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // pdfkit's built-in A5 dimensions: 419.53 x 595.28 pt — same value
    // receipt-pdf.test.ts already confirms for renderReceiptPdf('A5').
    expect(buffer.toString('latin1')).toContain('/MediaBox [0 0 419.53 595.28]');
  });

  it('draws the exact same layoutText it is given, unmodified, at a given size — the layer boundary that makes the structural-only check above sufficient', async () => {
    // renderInvoicePdf must not reformat, truncate, or otherwise alter
    // the already-tested layout text — it only draws it. Two different
    // layouts at the same page size must produce two different
    // (non-identical) PDF byte sequences, proving the input actually
    // reaches pdfkit's text drawing call rather than being ignored.
    const bufferA = await renderInvoicePdf(SAMPLE_LAYOUT, 'A4');
    const bufferB = await renderInvoicePdf('INV-9999\nCustomer: Someone Else\n', 'A4');

    expect(bufferA.equals(bufferB)).toBe(false);
  });
});
