import { ipcMain } from 'electron';
import { FinishSetupInput } from '@shop/contracts';
import {
  createKyselyDb,
  hasTenant,
  openDatabase,
  seed,
  setReceiptPaperSize,
  setShopName,
} from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';
import { runImport, type ImportResult } from './import.handler.js';

export interface SetupHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
  readonly logDir: string;
}

export interface SetupStatusResult {
  readonly tenantExists: boolean;
}

export interface FinishSetupResult {
  /** Null when no CSV was provided, or when the import itself threw. */
  readonly itemsImport: ImportResult | null;
  /**
   * Set only if a CSV was provided and the import step threw (e.g. an
   * unreadable file reaching this far despite the wizard's own
   * client-side header check). Per the owner's explicit instruction —
   * "CSV import errors must not block setup completion" — this is
   * reported back, never thrown: the tenant row, business units, and
   * settings written earlier in the same call are already committed.
   */
  readonly itemsImportError: string | null;
}

/**
 * Phase 18, go-live preparation — first-run setup wizard, "On finish"
 * step. Order matters:
 *   1. seed() with the owner's real shop/owner name — this is the ONE
 *      call that inserts the tenant row (every other seed* step inside
 *      it needs that row to already exist, via its own tenant_id
 *      foreign key — connection.ts's `foreign_keys = ON`), so nothing
 *      before this point could have written a tenant row even if the
 *      wizard was abandoned partway (the interrupted-setup edge case).
 *   2. shopName/receiptPaperSize settings — shopName duplicates what
 *      just went into tenant.business_name, but settings.shopName
 *      (not the tenant row) is what getShopIdentity/every printed
 *      document actually reads (shop-identity.repository.ts); writing
 *      only the tenant column would make the wizard's "shop name"
 *      field invisible everywhere it matters.
 *   3. CSV import, if provided — reuses `runImport`, the exact same
 *      function the Items screen's own import channel calls, so
 *      validation and error reporting are identical. Only reachable
 *      once step 1 has created the business units/uoms/price
 *      level/warehouse the import's lookups resolve against.
 */
export async function finishSetup(
  deps: SetupHandlerDeps,
  input: FinishSetupInput,
): Promise<FinishSetupResult> {
  const db = openDatabase(deps.dbPath);
  try {
    seed(db, deps.tenantId, { businessName: input.shopName, ownerName: input.ownerName });
    const kyselyDb = createKyselyDb(db);
    await setShopName(kyselyDb, deps.tenantId, input.shopName);
    await setReceiptPaperSize(kyselyDb, deps.tenantId, input.paperSize);
  } finally {
    db.close();
  }

  if (input.itemsCsv === undefined) {
    return { itemsImport: null, itemsImportError: null };
  }

  try {
    const itemsImport = await runImport(
      {
        dbPath: deps.dbPath,
        tenantId: deps.tenantId,
        deviceCode: deps.deviceCode,
        logDir: deps.logDir,
      },
      input.itemsCsv,
      true,
    );
    return { itemsImport, itemsImportError: null };
  } catch (error) {
    return {
      itemsImport: null,
      itemsImportError: error instanceof Error ? error.message : 'Item import failed',
    };
  }
}

// Synchronous, not async — better-sqlite3 itself is synchronous and
// there is no other work to await. Callers (registerSetupHandlers
// below, and setup.handler.test.ts) still `await` it freely: awaiting
// a plain value is legal and simply resolves to it.
export function getSetupStatus(
  deps: Pick<SetupHandlerDeps, 'dbPath' | 'tenantId'>,
): SetupStatusResult {
  const db = openDatabase(deps.dbPath);
  try {
    return { tenantExists: hasTenant(db, deps.tenantId) };
  } finally {
    db.close();
  }
}

export function registerSetupHandlers(deps: SetupHandlerDeps): void {
  ipcMain.handle(
    channels.setup.status,
    withError((): Promise<SetupStatusResult> => Promise.resolve(getSetupStatus(deps))),
  );
  ipcMain.handle(
    channels.setup.finish,
    withError(async (_event, raw: unknown): Promise<FinishSetupResult> => {
      const input = FinishSetupInput.parse(raw);
      return finishSetup(deps, input);
    }),
  );
}
