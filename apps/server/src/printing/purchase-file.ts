import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * renderPurchasePdf writes directly to a path (unlike the receipt/invoice
 * flow, which renders a Buffer first and saves it separately) — this
 * just computes where that path is. Same "purchase-order-" prefix
 * convention as receipt-/invoice-file.ts's own prefixes, so the three
 * document types never collide in os.tmpdir(). Not cleaned up
 * immediately — same already-logged future task in PROJECT.md covers
 * this prefix too.
 */
export function purchaseOrderTempFilePath(purchaseId: string, now: Date = new Date()): string {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return path.join(tmpdir(), `purchase-order-${purchaseId}-${timestamp}.pdf`);
}
