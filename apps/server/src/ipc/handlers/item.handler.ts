import { ipcMain } from 'electron';
import {
  CreateItemInput,
  ItemGetPricesInput,
  ItemIdInput,
  ItemSearchInput,
  ItemTopSellingInput,
  type ItemDto,
  type ItemLookups,
  type ItemPricesDto,
} from '@shop/contracts';
import { createItem, searchItems, topSellingItems } from '@shop/core';
import {
  createKyselyDb,
  getItemPriceHistory,
  getItemPrices,
  KyselyItemRepository,
  listBusinessUnits,
  listCategories,
  listUoms,
  listUomConversions,
  openDatabase,
  type ItemPriceHistoryRow,
  type UomConversionOption,
} from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface ItemHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

/**
 * P17-2 (docs/phases/PHASE_17.md §2.2, S17-DASH-1). Extracted as a plain
 * function so it can be tested directly (matching
 * customer-balance-import.handler.ts's precedent) — no electron mocking.
 * Counts `item.isLowStock` — the one field `KyselyItemRepository.searchItems`
 * already computes (via `@shop/core`'s pure `isLowStock`) for every
 * consumer (Items-list badge/filter, POS badge, this count). Never
 * re-derived here — review fix, see docs/phases/PHASE_17.md §8 P17-2.
 */
export async function runLowStockCount(deps: ItemHandlerDeps): Promise<number> {
  const db = openDatabase(deps.dbPath);
  try {
    const repo = new KyselyItemRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
    const items = await searchItems(repo, { query: '', categoryId: null });
    return items.filter((item) => item.isLowStock).length;
  } finally {
    db.close();
  }
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

  ipcMain.handle(
    channels.item.topSelling,
    async (_event, raw: unknown): Promise<readonly ItemDto[]> => {
      const input = ItemTopSellingInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyItemRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await topSellingItems(repo, input.limit);
      } finally {
        db.close();
      }
    },
  );

  ipcMain.handle(channels.item.getPrices, async (_event, raw: unknown): Promise<ItemPricesDto> => {
    const input = ItemGetPricesInput.parse(raw);
    const db = openDatabase(deps.dbPath);
    try {
      return await getItemPrices(
        createKyselyDb(db),
        deps.tenantId,
        input.itemIds,
        input.priceLevelId,
      );
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
    channels.item.priceHistory,
    withError(async (_event, raw: unknown): Promise<readonly ItemPriceHistoryRow[]> => {
      const input = ItemIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        return await getItemPriceHistory(createKyselyDb(db), deps.tenantId, input.itemId);
      } finally {
        db.close();
      }
    }),
  );

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

  ipcMain.handle(
    channels.item.lowStockCount,
    withError((): Promise<number> => runLowStockCount(deps)),
  );
}
