import { contextBridge, ipcRenderer } from 'electron';
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
  SaleSearchInput,
  SaleSummaryDto,
  SetReceiptPaperSizeInput,
  SetShopNameInput,
  StockValuationReportDto,
  SupplierBalanceDto,
  SupplierDto,
  SupplierSearchInput,
  UnitPlReportDto,
} from '@shop/contracts';
import type { SaleRecord } from '@shop/core';
import type { ReceiptPaperSize, UomConversionOption } from '@shop/db';
import { channels } from './ipc/channels.js';
import type { CreateCustomerResult } from './ipc/handlers/customer.handler.js';
import type { CustomerBalanceImportResult } from './ipc/handlers/customer-balance-import.handler.js';
import type { ImportResult } from './ipc/handlers/import.handler.js';
import type { CreatePurchaseResult } from './ipc/handlers/purchase.handler.js';
import type { CreateSupplierResult } from './ipc/handlers/supplier.handler.js';
import type { SupplierBalanceImportResult } from './ipc/handlers/supplier-balance-import.handler.js';
import type { BackupNowResult, RestoreResult } from './ipc/handlers/backup.handler.js';
import type { CreateSaleAndPrintResult } from './printing/create-sale-and-print.js';
import type { PrintReceiptResult } from './printing/print-receipt.js';
import type { InvoicePrintOutcome } from './printing/print-invoice-safely.js';
import type { PurchasePrintOutcome } from './printing/print-purchase-safely.js';

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
  customer: {
    create: (input: CreateCustomerInput): Promise<CreateCustomerResult> =>
      ipcRenderer.invoke(channels.customer.create, input) as Promise<CreateCustomerResult>,
    search: (input: CustomerSearchInput): Promise<readonly CustomerDto[]> =>
      ipcRenderer.invoke(channels.customer.search, input) as Promise<readonly CustomerDto[]>,
    get: (id: string): Promise<CustomerDto | null> =>
      ipcRenderer.invoke(channels.customer.get, { id }) as Promise<CustomerDto | null>,
    balance: (id: string): Promise<CustomerBalanceDto> =>
      ipcRenderer.invoke(channels.customer.balance, { id }) as Promise<CustomerBalanceDto>,
  },
  party: {
    create: (input: CreateSupplierInput): Promise<CreateSupplierResult> =>
      ipcRenderer.invoke(channels.party.create, input) as Promise<CreateSupplierResult>,
    search: (input: SupplierSearchInput): Promise<readonly SupplierDto[]> =>
      ipcRenderer.invoke(channels.party.search, input) as Promise<readonly SupplierDto[]>,
    get: (id: string): Promise<SupplierDto | null> =>
      ipcRenderer.invoke(channels.party.get, { id }) as Promise<SupplierDto | null>,
    balance: (id: string): Promise<SupplierBalanceDto> =>
      ipcRenderer.invoke(channels.party.balance, { id }) as Promise<SupplierBalanceDto>,
  },
  purchase: {
    create: (input: CreatePurchaseInput): Promise<CreatePurchaseResult> =>
      ipcRenderer.invoke(channels.purchase.create, input) as Promise<CreatePurchaseResult>,
    cancel: (input: PurchaseIdInput): Promise<void> =>
      ipcRenderer.invoke(channels.purchase.cancel, input) as Promise<void>,
    list: (input: PurchaseListInput): Promise<readonly PurchaseListRowDto[]> =>
      ipcRenderer.invoke(channels.purchase.list, input) as Promise<readonly PurchaseListRowDto[]>,
    printOrder: (purchaseId: string): Promise<PurchasePrintOutcome> =>
      ipcRenderer.invoke(channels.purchase.printOrder, {
        id: purchaseId,
      }) as Promise<PurchasePrintOutcome>,
  },
  sale: {
    create: (input: CreateSaleInput): Promise<CreateSaleAndPrintResult> =>
      ipcRenderer.invoke(channels.sale.create, input) as Promise<CreateSaleAndPrintResult>,
    cancel: (input: CancelSaleInput): Promise<void> =>
      ipcRenderer.invoke(channels.sale.cancel, input) as Promise<void>,
    getById: (id: string): Promise<SaleRecord | null> =>
      ipcRenderer.invoke(channels.sale.getById, { id }) as Promise<SaleRecord | null>,
    listByDate: (input: SaleSearchInput): Promise<readonly SaleSummaryDto[]> =>
      ipcRenderer.invoke(channels.sale.listByDate, input) as Promise<readonly SaleSummaryDto[]>,
  },
  print: {
    reprintReceipt: (saleId: string): Promise<PrintReceiptResult> =>
      ipcRenderer.invoke(channels.print.reprintReceipt, {
        id: saleId,
      }) as Promise<PrintReceiptResult>,
  },
  invoice: {
    printSaleInvoice: (saleId: string): Promise<InvoicePrintOutcome> =>
      ipcRenderer.invoke(channels.invoice.printSaleInvoice, {
        id: saleId,
      }) as Promise<InvoicePrintOutcome>,
  },
  report: {
    stockValuation: (): Promise<StockValuationReportDto> =>
      ipcRenderer.invoke(channels.report.stockValuation) as Promise<StockValuationReportDto>,
    dailySales: (input: DailySalesReportInput): Promise<readonly DailySalesReportRowDto[]> =>
      ipcRenderer.invoke(channels.report.dailySales, input) as Promise<
        readonly DailySalesReportRowDto[]
      >,
    receivables: (): Promise<readonly ReceivablesAgingRowDto[]> =>
      ipcRenderer.invoke(channels.report.receivables) as Promise<readonly ReceivablesAgingRowDto[]>,
    cashBook: (input: CashBookReportInput): Promise<readonly CashBookRowDto[]> =>
      ipcRenderer.invoke(channels.report.cashBook, input) as Promise<readonly CashBookRowDto[]>,
    unitPl: (): Promise<UnitPlReportDto> =>
      ipcRenderer.invoke(channels.report.unitPl) as Promise<UnitPlReportDto>,
  },
  payment: {
    receive: (input: CreatePaymentInput): Promise<PaymentDto> =>
      ipcRenderer.invoke(channels.payment.receive, input) as Promise<PaymentDto>,
  },
  uom: {
    listConversions: (): Promise<readonly UomConversionOption[]> =>
      ipcRenderer.invoke(channels.uom.listConversions) as Promise<readonly UomConversionOption[]>,
  },
  importData: {
    dryRun: (): Promise<ImportResult | null> =>
      ipcRenderer.invoke(channels.importData.dryRun) as Promise<ImportResult | null>,
    commit: (): Promise<ImportResult | null> =>
      ipcRenderer.invoke(channels.importData.commit) as Promise<ImportResult | null>,
  },
  importSupplierBalance: {
    dryRun: (): Promise<SupplierBalanceImportResult | null> =>
      ipcRenderer.invoke(
        channels.importData.supplierBalanceDryRun,
      ) as Promise<SupplierBalanceImportResult | null>,
    commit: (): Promise<SupplierBalanceImportResult | null> =>
      ipcRenderer.invoke(
        channels.importData.supplierBalanceCommit,
      ) as Promise<SupplierBalanceImportResult | null>,
  },
  importCustomerBalance: {
    dryRun: (): Promise<CustomerBalanceImportResult | null> =>
      ipcRenderer.invoke(
        channels.importData.customerBalanceDryRun,
      ) as Promise<CustomerBalanceImportResult | null>,
    commit: (): Promise<CustomerBalanceImportResult | null> =>
      ipcRenderer.invoke(
        channels.importData.customerBalanceCommit,
      ) as Promise<CustomerBalanceImportResult | null>,
  },
  backup: {
    now: (): Promise<BackupNowResult | null> =>
      ipcRenderer.invoke(channels.backup.now) as Promise<BackupNowResult | null>,
    restore: (): Promise<RestoreResult | null> =>
      ipcRenderer.invoke(channels.backup.restore) as Promise<RestoreResult | null>,
  },
  setting: {
    getReceiptPaperSize: (): Promise<ReceiptPaperSize> =>
      ipcRenderer.invoke(channels.setting.getReceiptPaperSize) as Promise<ReceiptPaperSize>,
    setReceiptPaperSize: (input: SetReceiptPaperSizeInput): Promise<void> =>
      ipcRenderer.invoke(channels.setting.setReceiptPaperSize, input) as Promise<void>,
    getShopName: (): Promise<string> =>
      ipcRenderer.invoke(channels.setting.getShopName) as Promise<string>,
    setShopName: (input: SetShopNameInput): Promise<void> =>
      ipcRenderer.invoke(channels.setting.setShopName, input) as Promise<void>,
  },
});
