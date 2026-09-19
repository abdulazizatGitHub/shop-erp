import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** CL-8C. Mirrors invoice-file.ts's saveInvoiceToTempFile, with a "customer-statement-" prefix. */
export async function saveCustomerStatementToTempFile(
  customerId: string,
  pdfBytes: Buffer,
  now: Date = new Date(),
): Promise<string> {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(tmpdir(), `customer-statement-${customerId}-${timestamp}.pdf`);
  await writeFile(filePath, pdfBytes);
  return filePath;
}
