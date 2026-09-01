import type {
  CancelSaleInput,
  CashBookReportInput,
  CashBookRowDto,
  CreateCustomerInput,
  CreateItemInput,
  CreatePaymentInput,
  CreatePurchaseInput,
  CreateSaleInput,
  CreateSupplierInput,
  CustomerBalanceDto,
  CustomerDto,
  CustomerSearchInput,
  DailySalesReportInput,
  DailySalesReportRowDto,
  ItemDto,
  ItemLookups,
  ItemSearchInput,
  PaymentDto,
  PurchaseIdInput,
  PurchaseListInput,
  PurchaseListRowDto,
  ReceivablesAgingRowDto,
  SaleResult,
  SaleSearchInput,
  SaleSummaryDto,
  StockValuationReportDto,
  SupplierBalanceDto,
  SupplierDto,
  SupplierSearchInput,
  UnitPlReportDto,
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

export interface BackupNowResult {
  readonly backupPath: string;
  readonly sizeBytes: number;
}

export interface RestoreResult {
  readonly restoredFrom: string;
}

export type ReceiptPaperSize = 'A4' | 'A5';

export interface SetReceiptPaperSizeInput {
  readonly value: ReceiptPaperSize;
}

export interface SetShopNameInput {
  readonly value: string;
}

export interface CreateSaleAndPrintResult extends SaleResult {
  readonly printError: string | null;
}

export interface PrintReceiptResult {
  readonly filePath: string;
}

export interface InvoicePrintOutcome {
  readonly filePath: string | null;
  readonly printError: string | null;
}

export interface PurchasePrintOutcome {
  readonly filePath: string | null;
  readonly printError: string | null;
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
    readonly list: (input: PurchaseListInput) => Promise<readonly PurchaseListRowDto[]>;
    readonly printOrder: (purchaseId: string) => Promise<PurchasePrintOutcome>;
  };
  readonly sale: {
    readonly create: (input: CreateSaleInput) => Promise<CreateSaleAndPrintResult>;
    readonly cancel: (input: CancelSaleInput) => Promise<void>;
    // P4.5-6: was already wired end-to-end (handler + preload) but
    // missing from this type — the Daily Sales report's per-sale table
    // is the first client caller.
    readonly listByDate: (input: SaleSearchInput) => Promise<readonly SaleSummaryDto[]>;
  };
  readonly print: {
    readonly reprintReceipt: (saleId: string) => Promise<PrintReceiptResult>;
  };
  readonly invoice: {
    readonly printSaleInvoice: (saleId: string) => Promise<InvoicePrintOutcome>;
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
  readonly backup: {
    readonly now: () => Promise<BackupNowResult | null>;
    readonly restore: () => Promise<RestoreResult | null>;
  };
  readonly setting: {
    readonly getReceiptPaperSize: () => Promise<ReceiptPaperSize>;
    readonly setReceiptPaperSize: (input: SetReceiptPaperSizeInput) => Promise<void>;
    readonly getShopName: () => Promise<string>;
    readonly setShopName: (input: SetShopNameInput) => Promise<void>;
  };
  readonly report: {
    readonly stockValuation: () => Promise<StockValuationReportDto>;
    readonly dailySales: (
      input: DailySalesReportInput,
    ) => Promise<readonly DailySalesReportRowDto[]>;
    readonly receivables: () => Promise<readonly ReceivablesAgingRowDto[]>;
    readonly cashBook: (input: CashBookReportInput) => Promise<readonly CashBookRowDto[]>;
    readonly unitPl: () => Promise<UnitPlReportDto>;
  };
}

declare global {
  interface Window {
    api: ElectronApi;
  }
}

export {};
