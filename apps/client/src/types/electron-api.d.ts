import type {
  AssignTechnicianInput,
  CancelSaleInput,
  CashBookReportInput,
  CashBookRowDto,
  CreateCustomerInput,
  CreateInternalTransferInput,
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
  IssuePartsToTechnicianInput,
  IssuePartsToTechnicianResult,
  ItemDto,
  ItemLookups,
  ItemSearchInput,
  JobDto,
  JobIdInput,
  JobSearchInput,
  JobStatusTransitionInput,
  JobSummaryDto,
  TechnicianCustodyInput,
  NewInternalTransferResult,
  PaymentDto,
  PurchaseIdInput,
  PurchaseListInput,
  PurchaseListRowDto,
  ReceivablesAgingRowDto,
  RecordCustodyReconciliationInput,
  SaleResult,
  SaleSearchInput,
  SaleSummaryDto,
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

/** Mirrors @shop/core's JobSplitRecord — v_job_split's columns exactly. */
export interface JobSplitRecord {
  readonly jobId: string;
  readonly docNo: string;
  readonly receivedDate: string;
  readonly jobType: string;
  readonly revenueType: string;
  readonly status: string;
  readonly customerName: string | null;
  readonly billedToName: string | null;
  readonly technicianName: string | null;
  readonly partsChargedPaisa: number;
  readonly partsCostPaisa: number;
  readonly partsMarginPaisa: number;
  readonly labourChargePaisa: number;
  readonly totalBillPaisa: number;
}

/** Mirrors @shop/core's JobPartRecord. */
export interface JobPartRecord {
  readonly id: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly quantityMilli: number;
  readonly unitCostPaisa: number;
  readonly unitPricePaisa: number;
  readonly entryType: string;
  readonly reversesJobPartId: string | null;
  readonly isBillable: boolean;
  readonly issuedAt: string;
}

/** Mirrors @shop/core's TechnicianCustodyRecord. */
export interface TechnicianCustodyRecord {
  readonly itemId: string;
  readonly itemName: string;
  readonly qtyHeldMilli: number;
  readonly lastMovement: string | null;
  readonly warehouseId: string;
}

/** Mirrors @shop/db's BusinessUnitOption. */
export interface BusinessUnitOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

/** Mirrors @shop/db's TechnicianOption. */
export interface TechnicianOption {
  readonly id: string;
  readonly name: string;
}

/** Mirrors @shop/db's ServiceChargeOption. */
export interface ServiceChargeOption {
  readonly id: string;
  readonly name: string;
  readonly businessUnitId: string;
  readonly retailChargePaisa: number;
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
  readonly staff: {
    readonly create: (input: StaffCreateInput) => Promise<{ id: string; partyCode: string }>;
    readonly listStaff: () => Promise<readonly StaffDto[]>;
    readonly saveAttendance: (input: SaveAttendanceInput) => Promise<void>;
    readonly getMonthAttendance: (
      input: GetMonthAttendanceInput,
    ) => Promise<readonly AttendanceRecordDto[]>;
    readonly recordAdvance: (input: RecordAdvanceInput) => Promise<AdvanceDto>;
    readonly listAdvances: (input: ListAdvancesInput) => Promise<readonly AdvanceDto[]>;
  };
  readonly expense: {
    readonly create: (input: CreateExpenseInput) => Promise<ExpenseDto>;
    readonly list: (input: ListExpensesInput) => Promise<readonly ExpenseDto[]>;
    readonly listCategories: () => Promise<readonly ExpenseCategoryDto[]>;
    readonly listBusinessUnits: () => Promise<readonly BusinessUnitOption[]>;
  };
  readonly cashSession: {
    readonly open: (input: OpenSessionInput) => Promise<CashSessionDto>;
    readonly close: (input: CloseSessionInput) => Promise<CashSessionDto>;
    readonly today: () => Promise<CashSessionDto | null>;
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
  readonly job: {
    readonly create: (input: CreateJobInput) => Promise<JobDto>;
    readonly assignTechnician: (input: AssignTechnicianInput) => Promise<JobDto>;
    readonly transitionStatus: (input: JobStatusTransitionInput) => Promise<JobDto>;
    readonly getById: (input: JobIdInput) => Promise<JobDto | null>;
    readonly list: (input: JobSearchInput) => Promise<readonly JobSummaryDto[]>;
    readonly issueToTechnician: (
      input: IssuePartsToTechnicianInput,
    ) => Promise<IssuePartsToTechnicianResult>;
    readonly issueToJob: (input: IssuePartsToJobInput) => Promise<IssuePartsToJobResult>;
    readonly listJobParts: (id: string) => Promise<readonly JobPartRecord[]>;
    readonly deliver: (input: DeliverJobInput) => Promise<DeliverJobResult>;
    readonly createInternalTransfer: (
      input: CreateInternalTransferInput,
    ) => Promise<NewInternalTransferResult>;
    readonly reconcileCustody: (
      input: RecordCustodyReconciliationInput,
    ) => Promise<CustodyReconciliationResult>;
    readonly getJobSplit: (id: string) => Promise<JobSplitRecord | null>;
    readonly getTechnicianCustody: (
      input: TechnicianCustodyInput,
    ) => Promise<readonly TechnicianCustodyRecord[]>;
    readonly listTechnicians: () => Promise<readonly TechnicianOption[]>;
    readonly listServiceCharges: () => Promise<readonly ServiceChargeOption[]>;
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
    readonly wageMonth: (input: WageMonthInput) => Promise<readonly WageMonthRowDto[]>;
  };
}

declare global {
  interface Window {
    api: ElectronApi;
  }
}

export {};
