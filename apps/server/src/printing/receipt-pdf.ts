import PDFDocument from 'pdfkit';

/**
 * P4-1b. One template: draws the already-built, already-tested layout
 * text (see @shop/core buildReceiptLayout) onto a page of the given
 * size. No field-formatting logic lives here — that would risk the
 * PDF's actual text drifting from the tested layout string. Page size
 * is pdfkit's own built-in 'A4'/'A5' — no hardcoded point dimensions.
 */
export type ReceiptPageSize = 'A4' | 'A5';

export function renderReceiptPdf(layoutText: string, pageSize: ReceiptPageSize): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: pageSize, margin: 36 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', (err: unknown) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });

    doc.fontSize(10).font('Helvetica').text(layoutText);
    doc.end();
  });
}
