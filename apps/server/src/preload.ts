import { contextBridge, ipcRenderer } from 'electron';
import type { CreateItemInput, ItemDto, ItemLookups, ItemSearchInput } from '@shop/contracts';
import { channels } from './ipc/channels.js';
import type { ImportResult } from './ipc/handlers/import.handler.js';

interface CreateItemResult {
  readonly id: string;
  readonly itemCode: string;
}

/**
 * The ONLY renderer-visible surface. Never expose ipcRenderer directly —
 * see docs/DATABASE_RULES.md section 5 and docs/SYSTEM_DESIGN.md section 1.
 */
contextBridge.exposeInMainWorld('api', {
  system: {
    ping: (): Promise<{ tableCount: number }> =>
      ipcRenderer.invoke(channels.system.ping) as Promise<{ tableCount: number }>,
  },
  item: {
    create: (input: CreateItemInput): Promise<CreateItemResult> =>
      ipcRenderer.invoke(channels.item.create, input) as Promise<CreateItemResult>,
    search: (input: ItemSearchInput): Promise<readonly ItemDto[]> =>
      ipcRenderer.invoke(channels.item.search, input) as Promise<readonly ItemDto[]>,
    lookups: (): Promise<ItemLookups> =>
      ipcRenderer.invoke(channels.item.lookups) as Promise<ItemLookups>,
  },
  importData: {
    dryRun: (): Promise<ImportResult | null> =>
      ipcRenderer.invoke(channels.importData.dryRun) as Promise<ImportResult | null>,
    commit: (): Promise<ImportResult | null> =>
      ipcRenderer.invoke(channels.importData.commit) as Promise<ImportResult | null>,
  },
});
