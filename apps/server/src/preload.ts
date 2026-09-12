import { contextBridge, ipcRenderer } from 'electron';
import type {
  AssignTechnicianInput,
  CancelSaleInput,
  CashBookReportInput,
  CashBookRowDto,
  CreateCustomerInput,
  CreateItemInput,
  CreateJobInput,
  CreatePaymentInput,
  CreatePurchaseInput,
  CreateSaleInput,
  CreateSupplierInput,
  CustodyReconciliationResult,
  CustomerBalanceDto,
  CustomerDto,
  CustomerSearchInput,
  DailySalesReportInput,
  DailySalesReportRowDto,
  DeliverJobInput,
  DeliverJobResult,
  IssuePartsToJobInput,
  IssuePartsToJobResult,
  ImportItemsInput,
  ImportOpeningStockInput,
  ImportSupplierBalanceInput,
  ItemDto,
  ItemGetPricesInput,
  ItemLookups,
  ItemPricesDto,
  ItemSearchInput,
  ItemTopSellingInput,
  JobDto,
  JobIdInput,
  JobSearchInput,
  JobStatusTransitionInput,
  JobSummaryDto,
  TechnicianCustodyInput,
  PartyAnyDto,
  PartySearchAnyInput,
  PaymentDto,
  PurchaseIdInput,
  PurchaseListInput,
  PurchaseListRowDto,
  ReceivablesAgingRowDto,
  RecordCustodyReconciliationInput,
  SaleSearchInput,
  SaleSummaryDto,
  SetReceiptPaperSizeInput,
  SetShopNameInput,
  DiscountConfigDto,
  SetDiscountApplyWalkinInput,
  SetDiscountApplyWholesaleInput,
  SetDiscountPctEnabledInput,
  SetDiscountPctPresetsInput,
  SetDiscountPkrEnabledInput,
  SetDiscountPkrPresetsInput,
  AdvanceDto,
  AttendanceRecordDto,
  CashSessionDto,
  CloseSessionInput,
  CreateExpenseInput,
  ExpenseCategoryDto,
  ExpenseDto,
  GetMonthAttendanceInput,
  ListAdvancesInput,
  ListExpensesInput,
  OpenSessionInput,
  RecordAdvanceInput,
  SaveAttendanceInput,
  StaffCreateInput,
  StaffDto,
  StockValuationReportDto,
  SupplierBalanceDto,
  SupplierDto,
  SupplierSearchInput,
  UnitPlReportDto,
  WageMonthInput,
  WageMonthRowDto,
} from '@shop/contracts';
import type {
  JobPartRecord,
  JobSplitRecord,
  SaleRecord,
  TechnicianCustodyRecord,
} from '@shop/core';
import type {
  BusinessUnitOption,
  ReceiptPaperSize,
  ServiceChargeOption,
  TechnicianOption,
  UomConversionOption,
} from '@shop/db';
import { channels } from './ipc/channels.js';
import type { CreateCustomerResult } from './ipc/handlers/customer.handler.js';
import type { CustomerBalanceImportResult } from './ipc/handlers/customer-balance-import.handler.js';
import type { ImportResult } from './ipc/handlers/import.handler.js';
import type { OpeningStockImportResult } from './ipc/handlers/opening-stock-import.handler.js';
import type { CreatePurchaseResult } from './ipc/handlers/purchase.handler.js';
import type { CreateSupplierResult } from './ipc/handlers/supplier.handler.js';
import type { CreateStaffResult } from './ipc/handlers/staff.handler.js';
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
    getPrices: (input: ItemGetPricesInput): Promise<ItemPricesDto> =>
      ipcRenderer.invoke(channels.item.getPrices, input) as Promise<ItemPricesDto>,
    topSelling: (input: ItemTopSellingInput): Promise<readonly ItemDto[]> =>
      ipcRenderer.invoke(channels.item.topSelling, input) as Promise<readonly ItemDto[]>,
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
    searchAny: (input: PartySearchAnyInput): Promise<readonly PartyAnyDto[]> =>
      ipcRenderer.invoke(channels.party.searchAny, input) as Promise<readonly PartyAnyDto[]>,
    get: (id: string): Promise<SupplierDto | null> =>
      ipcRenderer.invoke(channels.party.get, { id }) as Promise<SupplierDto | null>,
    balance: (id: string): Promise<SupplierBalanceDto> =>
      ipcRenderer.invoke(channels.party.balance, { id }) as Promise<SupplierBalanceDto>,
  },
  staff: {
    create: (input: StaffCreateInput): Promise<CreateStaffResult> =>
      ipcRenderer.invoke(channels.staff.create, input) as Promise<CreateStaffResult>,
    listStaff: (): Promise<readonly StaffDto[]> =>
      ipcRenderer.invoke(channels.staff.listStaff) as Promise<readonly StaffDto[]>,
    saveAttendance: (input: SaveAttendanceInput): Promise<void> =>
      ipcRenderer.invoke(channels.staff.saveAttendance, input) as Promise<void>,
    getMonthAttendance: (input: GetMonthAttendanceInput): Promise<readonly AttendanceRecordDto[]> =>
      ipcRenderer.invoke(channels.staff.getMonthAttendance, input) as Promise<
        readonly AttendanceRecordDto[]
      >,
    recordAdvance: (input: RecordAdvanceInput): Promise<AdvanceDto> =>
      ipcRenderer.invoke(channels.staff.recordAdvance, input) as Promise<AdvanceDto>,
    listAdvances: (input: ListAdvancesInput): Promise<readonly AdvanceDto[]> =>
      ipcRenderer.invoke(channels.staff.listAdvances, input) as Promise<readonly AdvanceDto[]>,
  },
  expense: {
    create: (input: CreateExpenseInput): Promise<ExpenseDto> =>
      ipcRenderer.invoke(channels.expense.create, input) as Promise<ExpenseDto>,
    list: (input: ListExpensesInput): Promise<readonly ExpenseDto[]> =>
      ipcRenderer.invoke(channels.expense.list, input) as Promise<readonly ExpenseDto[]>,
    listCategories: (): Promise<readonly ExpenseCategoryDto[]> =>
      ipcRenderer.invoke(channels.expense.listCategories) as Promise<readonly ExpenseCategoryDto[]>,
    listBusinessUnits: (): Promise<readonly BusinessUnitOption[]> =>
      ipcRenderer.invoke(channels.expense.listBusinessUnits) as Promise<
        readonly BusinessUnitOption[]
      >,
  },
  cashSession: {
    open: (input: OpenSessionInput): Promise<CashSessionDto> =>
      ipcRenderer.invoke(channels.cashSession.open, input) as Promise<CashSessionDto>,
    close: (input: CloseSessionInput): Promise<CashSessionDto> =>
      ipcRenderer.invoke(channels.cashSession.close, input) as Promise<CashSessionDto>,
    today: (): Promise<CashSessionDto | null> =>
      ipcRenderer.invoke(channels.cashSession.today) as Promise<CashSessionDto | null>,
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
    wageMonth: (input: WageMonthInput): Promise<readonly WageMonthRowDto[]> =>
      ipcRenderer.invoke(channels.report.wageMonth, input) as Promise<readonly WageMonthRowDto[]>,
  },
  payment: {
    receive: (input: CreatePaymentInput): Promise<PaymentDto> =>
      ipcRenderer.invoke(channels.payment.receive, input) as Promise<PaymentDto>,
  },
  job: {
    create: (input: CreateJobInput): Promise<JobDto> =>
      ipcRenderer.invoke(channels.job.create, input) as Promise<JobDto>,
    assignTechnician: (input: AssignTechnicianInput): Promise<JobDto> =>
      ipcRenderer.invoke(channels.job.assignTechnician, input) as Promise<JobDto>,
    transitionStatus: (input: JobStatusTransitionInput): Promise<JobDto> =>
      ipcRenderer.invoke(channels.job.transitionStatus, input) as Promise<JobDto>,
    getById: (input: JobIdInput): Promise<JobDto | null> =>
      ipcRenderer.invoke(channels.job.getById, input) as Promise<JobDto | null>,
    list: (input: JobSearchInput): Promise<readonly JobSummaryDto[]> =>
      ipcRenderer.invoke(channels.job.list, input) as Promise<readonly JobSummaryDto[]>,
    issueToJob: (input: IssuePartsToJobInput): Promise<IssuePartsToJobResult> =>
      ipcRenderer.invoke(channels.job.issueToJob, input) as Promise<IssuePartsToJobResult>,
    listJobParts: (id: string): Promise<readonly JobPartRecord[]> =>
      ipcRenderer.invoke(channels.job.listJobParts, { id }) as Promise<readonly JobPartRecord[]>,
    deliver: (input: DeliverJobInput): Promise<DeliverJobResult> =>
      ipcRenderer.invoke(channels.job.deliver, input) as Promise<DeliverJobResult>,
    reconcileCustody: (
      input: RecordCustodyReconciliationInput,
    ): Promise<CustodyReconciliationResult> =>
      ipcRenderer.invoke(
        channels.job.reconcileCustody,
        input,
      ) as Promise<CustodyReconciliationResult>,
    getJobSplit: (id: string): Promise<JobSplitRecord | null> =>
      ipcRenderer.invoke(channels.job.getJobSplit, { id }) as Promise<JobSplitRecord | null>,
    getTechnicianCustody: (
      input: TechnicianCustodyInput,
    ): Promise<readonly TechnicianCustodyRecord[]> =>
      ipcRenderer.invoke(channels.job.getTechnicianCustody, input) as Promise<
        readonly TechnicianCustodyRecord[]
      >,
    listTechnicians: (): Promise<readonly TechnicianOption[]> =>
      ipcRenderer.invoke(channels.job.listTechnicians) as Promise<readonly TechnicianOption[]>,
    listServiceCharges: (): Promise<readonly ServiceChargeOption[]> =>
      ipcRenderer.invoke(channels.job.listServiceCharges) as Promise<
        readonly ServiceChargeOption[]
      >,
  },
  uom: {
    listConversions: (): Promise<readonly UomConversionOption[]> =>
      ipcRenderer.invoke(channels.uom.listConversions) as Promise<readonly UomConversionOption[]>,
  },
  importData: {
    dryRun: (input: ImportItemsInput): Promise<ImportResult> =>
      ipcRenderer.invoke(channels.importData.dryRun, input) as Promise<ImportResult>,
    commit: (input: ImportItemsInput): Promise<ImportResult> =>
      ipcRenderer.invoke(channels.importData.commit, input) as Promise<ImportResult>,
  },
  importOpeningStock: {
    dryRun: (input: ImportOpeningStockInput): Promise<OpeningStockImportResult> =>
      ipcRenderer.invoke(
        channels.importData.openingStockDryRun,
        input,
      ) as Promise<OpeningStockImportResult>,
    commit: (input: ImportOpeningStockInput): Promise<OpeningStockImportResult> =>
      ipcRenderer.invoke(
        channels.importData.openingStockCommit,
        input,
      ) as Promise<OpeningStockImportResult>,
  },
  importSupplierBalance: {
    dryRun: (input: ImportSupplierBalanceInput): Promise<SupplierBalanceImportResult> =>
      ipcRenderer.invoke(
        channels.importData.supplierBalanceDryRun,
        input,
      ) as Promise<SupplierBalanceImportResult>,
    commit: (input: ImportSupplierBalanceInput): Promise<SupplierBalanceImportResult> =>
      ipcRenderer.invoke(
        channels.importData.supplierBalanceCommit,
        input,
      ) as Promise<SupplierBalanceImportResult>,
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
    getDiscountApplyWalkin: (): Promise<boolean> =>
      ipcRenderer.invoke(channels.setting.getDiscountApplyWalkin) as Promise<boolean>,
    setDiscountApplyWalkin: (input: SetDiscountApplyWalkinInput): Promise<void> =>
      ipcRenderer.invoke(channels.setting.setDiscountApplyWalkin, input) as Promise<void>,
    getDiscountApplyWholesale: (): Promise<boolean> =>
      ipcRenderer.invoke(channels.setting.getDiscountApplyWholesale) as Promise<boolean>,
    setDiscountApplyWholesale: (input: SetDiscountApplyWholesaleInput): Promise<void> =>
      ipcRenderer.invoke(channels.setting.setDiscountApplyWholesale, input) as Promise<void>,
    getDiscountPkrEnabled: (): Promise<boolean> =>
      ipcRenderer.invoke(channels.setting.getDiscountPkrEnabled) as Promise<boolean>,
    setDiscountPkrEnabled: (input: SetDiscountPkrEnabledInput): Promise<void> =>
      ipcRenderer.invoke(channels.setting.setDiscountPkrEnabled, input) as Promise<void>,
    getDiscountPctEnabled: (): Promise<boolean> =>
      ipcRenderer.invoke(channels.setting.getDiscountPctEnabled) as Promise<boolean>,
    setDiscountPctEnabled: (input: SetDiscountPctEnabledInput): Promise<void> =>
      ipcRenderer.invoke(channels.setting.setDiscountPctEnabled, input) as Promise<void>,
    getDiscountPkrPresets: (): Promise<readonly string[]> =>
      ipcRenderer.invoke(channels.setting.getDiscountPkrPresets) as Promise<readonly string[]>,
    setDiscountPkrPresets: (input: SetDiscountPkrPresetsInput): Promise<void> =>
      ipcRenderer.invoke(channels.setting.setDiscountPkrPresets, input) as Promise<void>,
    getDiscountPctPresets: (): Promise<readonly string[]> =>
      ipcRenderer.invoke(channels.setting.getDiscountPctPresets) as Promise<readonly string[]>,
    setDiscountPctPresets: (input: SetDiscountPctPresetsInput): Promise<void> =>
      ipcRenderer.invoke(channels.setting.setDiscountPctPresets, input) as Promise<void>,
    getDiscountConfig: (): Promise<DiscountConfigDto> =>
      ipcRenderer.invoke(channels.setting.getDiscountConfig) as Promise<DiscountConfigDto>,
  },
});
