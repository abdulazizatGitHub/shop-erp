import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * P4-2. Mirrors receipt-file.ts's saveReceiptToTempFile exactly, with
 * an "invoice-" prefix instead of "receipt-" so the two document types
 * never collide or get confused in os.tmpdir(). Same rationale: not
 * cleaned up immediately, no dedicated cleanup task this phase (see
 * PROJECT.md's logged future task, which already covers both prefixes).
 */
export async function saveInvoiceToTempFile(
  saleId: string,
  pdfBytes: Buffer,
  now: Date = new Date(),
): Promise<string> {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(tmpdir(), `invoice-${saleId}-${timestamp}.pdf`);
  await writeFile(filePath, pdfBytes);
  return filePath;
}
