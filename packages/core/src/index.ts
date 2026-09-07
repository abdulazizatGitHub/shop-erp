export { createItem, getItem, searchItems } from './item/item.service.js';
export type {
  ItemRepositoryPort,
  NewItemInput,
  NewItemResult,
  ItemRecord,
  ItemSearchQuery,
} from './item/item.repository.port.js';

export { parseCsv } from './import/csv.js';
export type { ParsedCsvRow, ParseCsvResult } from './import/csv.js';
export {
  ITEM_COLUMNS,
  OPENING_STOCK_COLUMNS,
  BUSINESS_UNIT_LABEL_TO_CODE,
} from './import/item-columns.js';
export { validateItemRows, computeCostPerStockUnitPaisa } from './import/item-import.js';
export type {
  ItemImportLookups,
  NewItemImportRecord,
  ItemImportRowResult,
} from './import/item-import.js';
export { validateOpeningStockRows } from './import/opening-stock-import.js';
export type {
  OpeningStockImportLookups,
  OpeningStockItemLookup,
  NewOpeningStockRecord,
  OpeningStockRowResult,
} from './import/opening-stock-import.js';
export { SUPPLIER_BALANCE_COLUMNS } from './import/supplier-columns.js';
export { validateSupplierBalanceRows } from './import/supplier-balance-import.js';
export type {
  SupplierBalanceImportLookups,
  NewSupplierBalanceRecord,
  SupplierBalanceRowResult,
} from './import/supplier-balance-import.js';
export { CUSTOMER_BALANCE_COLUMNS } from './import/customer-columns.js';
export { validateCustomerBalanceRows } from './import/customer-balance-import.js';
export type {
  CustomerBalanceImportLookups,
  NewCustomerBalanceRecord,
  CustomerBalanceRowResult,
} from './import/customer-balance-import.js';
export {
  formatItemImportReport,
  formatOpeningStockImportReport,
  formatSupplierBalanceImportReport,
  formatCustomerBalanceImportReport,
} from './import/report.js';

export type {
  PartyRepositoryPort,
  NewSupplierInput,
  NewSupplierResult,
  SupplierRecord,
  SupplierSearchQuery,
  SupplierBalance,
  CustomerType,
  NewCustomerInput,
  NewCustomerResult,
  CustomerRecord,
  CustomerSearchQuery,
  CustomerBalance,
  StaffRole,
  NewStaffInput,
  NewStaffResult,
  StaffRecord,
  PartyAnySearchQuery,
  PartyAnyRecord,
} from './party/party.repository.port.js';

export type { AttendanceStatus } from '@shop/contracts';
export { computeDayWage } from './payroll/wage.service.js';
export { computeCommission } from './payroll/commission.service.js';
export type {
  RecordCommissionInput,
  CommissionRepositoryPort,
} from './payroll/commission.repository.port.js';
export { saveAttendanceBatch } from './payroll/attendance.service.js';
export type { AttendanceInputRow } from './payroll/attendance.service.js';
export type {
  BusinessUnitCode,
  SaveAttendanceBatchRow,
  SaveAttendanceBatchInput,
  AttendanceRecord,
  AttendanceRepositoryPort,
} from './payroll/attendance.repository.port.js';

export { createExpense, listExpenses, listCategories } from './expense/expense.service.js';
export type {
  ExpenseMethod,
  NewExpenseInput,
  ExpenseRecord,
  ListExpensesRepoInput,
  ExpenseCategoryRecord,
  ExpenseRepositoryPort,
} from './expense/expense.repository.port.js';

export { openSession, closeSession, getTodaySession } from './expense/cash-session.service.js';
export { SessionAlreadyOpenError } from './expense/cash-session.repository.port.js';
export type {
  CashSessionStatus,
  CashSessionRecord,
  OpenSessionRepoInput,
  CloseSessionRepoInput,
  CashSessionRepositoryPort,
} from './expense/cash-session.repository.port.js';

export { recordAdvance, listAdvances } from './payroll/advance.service.js';
export type {
  RecordAdvanceRepoInput,
  AdvanceRecord,
  ListAdvancesRepoInput,
  AdvanceRepositoryPort,
} from './payroll/advance.repository.port.js';

export type {
  PurchasePaymentMode,
  PurchaseRepositoryPort,
  NewPurchaseLineInput,
  NewPurchaseInput,
  NewPurchaseResult,
  PurchaseLineRecord,
  PurchaseRecord,
  PurchaseListRow,
} from './purchase/purchase.repository.port.js';

export {
  resolvePricePaisa,
  computeLineTotalPaisa,
  isCreditLimitExceeded,
  isStockBelowZero,
} from './sale/sale.js';
export type { PriceLevelInfo, ItemPriceInfo } from './sale/sale.js';
export type {
  SalePaymentMode,
  SaleRepositoryPort,
  NewSaleLineInput,
  NewSaleInput,
  SaleWarnings,
  NewSaleResult,
  SaleLineRecord,
  SaleRecord,
  SaleSearchQuery,
  SaleSummaryRecord,
} from './sale/sale.repository.port.js';

export type {
  PaymentMethod,
  PaymentDirection,
  NewPaymentInput,
  PaymentRecord,
  PaymentRepositoryPort,
} from './payment/payment.repository.port.js';

export type {
  JobStatus,
  JobRecord,
  JobSearchQuery,
  JobSummaryRecord,
  JobSplitRecord,
  TechnicianCustodyRecord,
  NewJobInput,
  JobStatusTransitionInput,
  AssignTechnicianInput,
  JobRepositoryPort,
} from './job/job.repository.port.js';
export { createJob, assignTechnician, transitionJobStatus } from './job/job.service.js';

export type {
  IssuePartsToTechnicianInput,
  IssuePartsToTechnicianResult,
  IssuePartsToJobInput,
  IssuePartsToJobResult,
  JobPartRecord,
  JobIssueRepositoryPort,
} from './job/job-issue.repository.port.js';
export { issuePartsToTechnician, issuePartsToJob } from './job/job-issue.service.js';

export { distinctPayerIds, validateMultiPayerPayment } from './job/job-delivery.js';
export type {
  DeliverJobPartLineInput,
  DeliverJobLabourLineInput,
  DeliverJobInput,
  DeliverJobResult,
  JobDeliveryRepositoryPort,
} from './job/job-delivery.repository.port.js';
export { deliverJob } from './job/job-delivery.service.js';

export type {
  InternalTransferReason,
  InternalTransferLineInput,
  NewInternalTransferInput,
  NewInternalTransferResult,
  InternalTransferRepositoryPort,
} from './job/internal-transfer.repository.port.js';
export { createInternalTransfer } from './job/internal-transfer.service.js';

export type {
  RecordCustodyReconciliationInput,
  CustodyReconciliationResult,
  CustodyRepositoryPort,
} from './job/custody.repository.port.js';
export { recordCustodyReconciliation } from './job/custody.service.js';

export { buildReceiptLayout } from './printing/receipt-layout.js';
export type { ReceiptData, ReceiptLineData } from './printing/receipt-layout.js';
export { buildInvoiceLayout } from './printing/invoice-layout.js';
export type { InvoiceLayoutData } from './printing/invoice-layout.js';
