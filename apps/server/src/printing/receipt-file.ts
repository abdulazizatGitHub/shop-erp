import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * P4-1c. Not cleaned up immediately — the Reprint path needs the file
 * to still exist (or at least the same generation path to be re-runnable;
 * currently the actual bytes are not reused, just the same directory/
 * naming scheme). A startup task deleting receipt-*.pdf files older
 * than 7 days is acceptable but not required this phase — logged in
 * PROJECT.md as a future task, not built here.
 */
export async function saveReceiptToTempFile(
  saleId: string,
  pdfBytes: Buffer,
  now: Date = new Date(),
): Promise<string> {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(tmpdir(), `receipt-${saleId}-${timestamp}.pdf`);
  await writeFile(filePath, pdfBytes);
  return filePath;
}
