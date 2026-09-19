import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** CL-7C. Mirrors invoice-file.ts's saveInvoiceToTempFile, with a "payment-receipt-" prefix. */
export async function savePaymentReceiptToTempFile(
  paymentId: string,
  pdfBytes: Buffer,
  now: Date = new Date(),
): Promise<string> {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(tmpdir(), `payment-receipt-${paymentId}-${timestamp}.pdf`);
  await writeFile(filePath, pdfBytes);
  return filePath;
}
