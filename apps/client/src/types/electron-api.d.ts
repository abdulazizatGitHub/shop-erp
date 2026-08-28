import type {
  CancelSaleInput,
  CreateCustomerInput,
  CreateItemInput,
  CreatePaymentInput,
  CreatePurchaseInput,
  CreateSaleInput,
  CreateSupplierInput,
  CustomerBalanceDto,
  CustomerDto,
  CustomerSearchInput,
  ItemDto,
  ItemLookups,
  ItemSearchInput,
  PaymentDto,
  PurchaseIdInput,
  SaleResult,
  SupplierBalanceDto,
  SupplierDto,
  SupplierSearchInput,
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

export interface UomConversionOption {
  readonly id: string;
  readonly fromUomId: string;
  readonly fromUomName: string;
  readonly toUomId: string;
  readonly toUomName: string;
  readonly factorMilli: number;
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
    readonly create: (input: CreateCustomerInput) => Promise<{ id: string; partyCode: string }>;
    readonly search: (input: CustomerSearchInput) => Promise<readonly CustomerDto[]>;
    readonly get: (id: string) => Promise<CustomerDto | null>;
    readonly balance: (id: string) => Promise<CustomerBalanceDto>;
  };
  readonly party: {
    readonly create: (input: CreateSupplierInput) => Promise<{ id: string; partyCode: string }>;
    readonly search: (input: SupplierSearchInput) => Promise<readonly SupplierDto[]>;
    readonly get: (id: string) => Promise<SupplierDto | null>;
    readonly balance: (id: string) => Promise<SupplierBalanceDto>;
  };
  readonly purchase: {
    readonly create: (input: CreatePurchaseInput) => Promise<{
      id: string;
      docNo: string;
      totalAmountPaisa: number;
    }>;
    readonly cancel: (input: PurchaseIdInput) => Promise<void>;
  };
  readonly sale: {
    readonly create: (input: CreateSaleInput) => Promise<SaleResult>;
    readonly cancel: (input: CancelSaleInput) => Promise<void>;
  };
  readonly payment: {
    readonly receive: (input: CreatePaymentInput) => Promise<PaymentDto>;
  };
  readonly uom: {
    readonly listConversions: () => Promise<readonly UomConversionOption[]>;
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
