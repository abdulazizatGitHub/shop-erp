import type { CreateItemInput, ItemDto, ItemLookups, ItemSearchInput } from '@shop/contracts';

export interface ImportResult {
  readonly itemsReportPath: string;
  readonly itemsLogReportPath: string;
  readonly itemsAccepted: number;
  readonly itemsRejected: number;
  readonly itemsSkipped: number;
  readonly openingStockReportPath: string | null;
  readonly openingStockLogReportPath: string | null;
  readonly openingStockAccepted: number | null;
  readonly openingStockRejected: number | null;
  readonly openingStockSkipped: number | null;
}

export interface SupplierBalanceImportResult {
  readonly reportPath: string;
  readonly logReportPath: string;
  readonly accepted: number;
  readonly rejected: number;
  readonly skipped: number;
}

export interface ElectronApi {
  readonly system: {
    readonly ping: () => Promise<{ tableCount: number }>;
  };
  readonly item: {
    readonly create: (input: CreateItemInput) => Promise<{ id: string; itemCode: string }>;
    readonly search: (input: ItemSearchInput) => Promise<readonly ItemDto[]>;
    readonly lookups: () => Promise<ItemLookups>;
  };
  readonly importData: {
    readonly dryRun: () => Promise<ImportResult | null>;
    readonly commit: () => Promise<ImportResult | null>;
  };
  readonly importSupplierBalance: {
    readonly dryRun: () => Promise<SupplierBalanceImportResult | null>;
    readonly commit: () => Promise<SupplierBalanceImportResult | null>;
  };
}

declare global {
  interface Window {
    api: ElectronApi;
  }
}

export {};
