import type { CreateItemInput, ItemDto, ItemLookups, ItemSearchInput } from '@shop/contracts';

export interface ElectronApi {
  readonly system: {
    readonly ping: () => Promise<{ tableCount: number }>;
  };
  readonly item: {
    readonly create: (input: CreateItemInput) => Promise<{ id: string; itemCode: string }>;
    readonly search: (input: ItemSearchInput) => Promise<readonly ItemDto[]>;
    readonly lookups: () => Promise<ItemLookups>;
  };
}

declare global {
  interface Window {
    api: ElectronApi;
  }
}

export {};
