import { ipcMain } from 'electron';
import {
  CreateGrnInput,
  GrnCsvDryRunInput,
  GrnIdInput,
  GrnListForPurchaseOrderInput,
} from '@shop/contracts';
import type {
  GrnCsvValidationResult,
  GrnRecord,
  GrnSummary,
  ParsedCsvRow,
  PoLineForCsvImport,
} from '@shop/core';
import { validateGrnCsvRows } from '@shop/core';
import {
  createKyselyDb,
  getItemsByCode,
  KyselyGrnRepository,
  KyselyPurchaseOrderRepository,
  openDatabase,
} from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface GrnHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

export interface CreateGrnResult {
  readonly id: string;
  readonly docNo: string;
}

export function registerGrnHandlers(deps: GrnHandlerDeps): void {
  ipcMain.handle(
    channels.grn.create,
    withError(async (_event, raw: unknown): Promise<CreateGrnResult> => {
      const input = CreateGrnInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyGrnRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.create(input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.grn.get,
    withError(async (_event, raw: unknown): Promise<GrnRecord | null> => {
      const input = GrnIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyGrnRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.get(input.id);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.grn.listForPO,
    withError(async (_event, raw: unknown): Promise<readonly GrnSummary[]> => {
      const input = GrnListForPurchaseOrderInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyGrnRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.listForPurchaseOrder(input.purchaseOrderId);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.grn.cancel,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = GrnIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyGrnRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        await repo.cancel(input.id);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.grn.csvDryRun,
    withError(async (_event, raw: unknown): Promise<GrnCsvValidationResult> => {
      const input = GrnCsvDryRunInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const kysely = createKyselyDb(db);
        const poRepo = new KyselyPurchaseOrderRepository(kysely, deps.tenantId, deps.deviceCode);
        const po = await poRepo.get(input.purchaseOrderId);
        if (!po) {
          throw new Error('Purchase order not found');
        }

        const poLines: PoLineForCsvImport[] = po.lines.map((l) => ({
          purchaseOrderLineId: l.id,
          itemId: l.itemId,
          orderedMilli: l.quantityOrderedMilli,
          alreadyReceivedMilli: l.quantityReceivedMilli,
        }));

        const itemCodes = Array.from(
          new Set(
            input.rows
              .map((r) => (r.cells['Item Code'] ?? '').trim())
              .filter((code) => code.length > 0),
          ),
        );
        const itemRows = await getItemsByCode(kysely, deps.tenantId, itemCodes);
        const itemsByCode = new Map(itemRows.map((r) => [r.itemCode, r]));

        const parsedRows: ParsedCsvRow[] = input.rows.map((r) => ({
          rowNumber: r.rowNumber,
          cells: r.cells,
        }));
        return validateGrnCsvRows(parsedRows, poLines, itemsByCode);
      } finally {
        db.close();
      }
    }),
  );
}
