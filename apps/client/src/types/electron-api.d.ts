import type {
  CancelSaleInput,
  CreateItemInput,
  CreatePaymentInput,
  CreateSaleInput,
  CustomerDto,
  CustomerSearchInput,
  ItemDto,
  ItemLookups,
  ItemSearchInput,
  PaymentDto,
  SaleResult,
} from '@shop/contracts';

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

export interface CustomerBalanceImportResult {
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
  readonly customer: {
    readonly search: (input: CustomerSearchInput) => Promise<readonly CustomerDto[]>;
  };
  readonly sale: {
    readonly create: (input: CreateSaleInput) => Promise<SaleResult>;
    readonly cancel: (input: CancelSaleInput) => Promise<void>;
  };
  readonly payment: {
    readonly receive: (input: CreatePaymentInput) => Promise<PaymentDto>;
  };
  readonly importData: {
    readonly dryRun: () => Promise<ImportResult | null>;
    readonly commit: () => Promise<ImportResult | null>;
  };
  readonly importSupplierBalance: {
    readonly dryRun: () => Promise<SupplierBalanceImportResult | null>;
    readonly commit: () => Promise<SupplierBalanceImportResult | null>;
  };
  readonly importCustomerBalance: {
    readonly dryRun: () => Promise<CustomerBalanceImportResult | null>;
    readonly commit: () => Promise<CustomerBalanceImportResult | null>;
  };
}

declare global {
  interface Window {
    api: ElectronApi;
  }
}

export {};
