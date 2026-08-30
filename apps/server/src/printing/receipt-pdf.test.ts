import { describe, expect, it } from 'vitest';
import { renderReceiptPdf } from './receipt-pdf.js';

const SAMPLE_LAYOUT = [
  'INV-0001',
  'Malakand AC & Fridge Care',
  '2026-08-29 14:30',
  '',
  'Compressor 1.5 Ton | 2 Piece | Rs 5,000 | Rs 10,000',
  '',
  'Grand Total: Rs 10,000',
].join('\n');

describe('renderReceiptPdf (P4-1b)', () => {
  it('produces a real PDF at A4 size — real bytes inspected, not mocked', async () => {
    const buffer = await renderReceiptPdf(SAMPLE_LAYOUT, 'A4');

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);

    // pdfkit's own built-in A4 dimensions (confirmed by generating a real
    // PDF and inspecting it directly — not assumed): 595.28 x 841.89 pt.
    // /MediaBox is part of the PDF's object structure, not the
    // (compressed) content stream, so this string is present in the raw
    // bytes regardless of text-stream compression.
    expect(buffer.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]');
  });

  it('produces a real PDF at A5 size — different page, same template', async () => {
    const buffer = await renderReceiptPdf(SAMPLE_LAYOUT, 'A5');

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // pdfkit's built-in A5 dimensions: 419.53 x 595.28 pt.
    expect(buffer.toString('latin1')).toContain('/MediaBox [0 0 419.53 595.28]');
  });
});
