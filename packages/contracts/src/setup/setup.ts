import { z } from 'zod';

/**
 * Phase 18, go-live preparation — first-run setup wizard. Shown when
 * the database has no tenant row yet; writes the tenant row, the
 * receiptPaperSize/shopName settings, and (optionally) imports a CSV
 * of items, in that order, inside `setup:finish`'s own handler
 * (apps/server/src/ipc/handlers/setup.handler.ts) — never partially,
 * since the CSV step reuses the exact same `runImport` function the
 * Items screen's own import already goes through.
 *
 * itemsCsv is optional, matching useImportItemsFlow's own
 * ImportItemsInput.itemsCsv shape (z.string().min(1)) for the "a CSV
 * was provided" case — omitted entirely (not an empty string) for the
 * "no CSV" case, so the handler can tell "skipped" from "empty file".
 */
export const FinishSetupInput = z.object({
  shopName: z.string().trim().min(1, 'Shop name is required.'),
  ownerName: z.string().trim().min(1, 'Owner name is required.'),
  paperSize: z.enum(['A4', 'A5']),
  itemsCsv: z.string().min(1).optional(),
});
export type FinishSetupInput = z.infer<typeof FinishSetupInput>;
