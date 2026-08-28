import { ipcMain } from 'electron';
import { CreateItemInput, ItemSearchInput, type ItemLookups } from '@shop/contracts';
import { createItem, searchItems } from '@shop/core';
import {
  createKyselyDb,
  KyselyItemRepository,
  listBusinessUnits,
  listCategories,
  listUoms,
  listUomConversions,
  openDatabase,
  type UomConversionOption,
} from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface ItemHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

export function registerItemHandlers(deps: ItemHandlerDeps): void {
  ipcMain.handle(channels.item.create, async (_event, raw: unknown) => {
    const input = CreateItemInput.parse(raw);
    const db = openDatabase(deps.dbPath);
    try {
      const repo = new KyselyItemRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
      return await createItem(repo, input);
    } finally {
      db.close();
    }
  });

  ipcMain.handle(channels.item.search, async (_event, raw: unknown) => {
    const input = ItemSearchInput.parse(raw);
    const db = openDatabase(deps.dbPath);
    try {
      const repo = new KyselyItemRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
      return await searchItems(repo, input);
    } finally {
      db.close();
    }
  });

  ipcMain.handle(channels.item.lookups, async (): Promise<ItemLookups> => {
    const db = openDatabase(deps.dbPath);
    try {
      const kysely = createKyselyDb(db);
      const [businessUnits, uoms, categories] = await Promise.all([
        listBusinessUnits(kysely, deps.tenantId),
        listUoms(kysely, deps.tenantId),
        listCategories(kysely, deps.tenantId),
      ]);
      return { businessUnits, uoms, categories };
    } finally {
      db.close();
    }
  });

  ipcMain.handle(
    channels.uom.listConversions,
    withError(async (): Promise<readonly UomConversionOption[]> => {
      const db = openDatabase(deps.dbPath);
      try {
        return await listUomConversions(createKyselyDb(db), deps.tenantId);
      } finally {
        db.close();
      }
    }),
  );
}
