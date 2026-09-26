export { createItem, getItem, searchItems, topSellingItems } from './item/item.service.js';
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
export {
  computeSuggestedCommissionPaisa,
  suggestCommissionRecipient,
  deriveCommissionMode,
} from './payroll/commission-claim.js';
export type { TechnicianAssignmentForSuggestion } from './payroll/commission-claim.js';
export {
  validateApprovalRecipients,
  assertNonBlankReason,
  isClaimPending,
} from './payroll/commission-decision.js';
export type { RecipientInput, RecipientPartyInfo } from './payroll/commission-decision.js';
export type {
  TechnicianHistoryEntry,
  DecisionRecipientRecord,
  DecisionRecord,
  PendingClaimSummary,
  ClaimSummary,
  ClaimDetail,
  ApproveClaimInput,
  RejectClaimInput,
  ReverseDecisionInput,
  CommissionDecisionRepositoryPort,
} from './payroll/commission-decision.repository.port.js';
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
  PurchaseOrderNotFoundError,
  PurchaseOrderAlreadyCancelledError,
  PurchaseOrderHasGrnsError,
} from './purchase-order/errors.js';
export type {
  PurchaseOrderStatus,
  PurchaseOrderRepositoryPort,
  NewPurchaseOrderLineInput,
  NewPurchaseOrderInput,
  NewPurchaseOrderResult,
  PurchaseOrderLineRecord,
  PurchaseOrderRecord,
  PurchaseOrderSummary,
} from './purchase-order/purchase-order.repository.port.js';

export {
  GrnNotFoundError,
  GrnAlreadyCancelledError,
  PurchaseOrderCancelledError,
  InvalidGrnLineError,
  MissingSupplierForCreditError,
} from './grn/errors.js';
export type {
  GrnPaymentMode,
  GrnStatus,
  GrnRepositoryPort,
  NewGrnLineInput,
  NewGrnInput,
  NewGrnResult,
  GrnLineRecord,
  GrnRecord,
  GrnSummary,
} from './grn/grn.repository.port.js';
export { GRN_CSV_COLUMNS, parseGrnCsv, validateGrnCsvRows } from './grn/grn-csv-import.js';
export type {
  GrnCsvItemLookup,
  PoLineForCsvImport,
  ValidatedGrnRow,
  RejectedGrnRow,
  GrnCsvValidationResult,
  ParseGrnCsvResult,
} from './grn/grn-csv-import.js';

export {
  resolvePricePaisa,
  computeLineTotalPaisa,
  isCreditLimitExceeded,
  isStockBelowZero,
  computeNegativeStockItems,
} from './sale/sale.js';
export type { PriceLevelInfo, ItemPriceInfo, NegativeStockCandidate } from './sale/sale.js';
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
  NegativeStockItem,
} from './sale/sale.repository.port.js';
export {
  DiscountExceedsSubtotalError,
  NegativeStockBlockedError,
  NegativeStockConfirmationRequiredError,
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
  JobStatusHistoryRecord,
  TechnicianCustodyRecord,
  NewJobInput,
  JobStatusTransitionInput,
  AssignTechnicianInput,
  JobRepositoryPort,
} from './job/job.repository.port.js';
export {
  createJob,
  assignTechnician,
  unassignTechnician,
  transitionJobStatus,
} from './job/job.service.js';

export type {
  TechnicianAssignmentRecord,
  JobTechnicianRepositoryPort,
} from './job/job-technician.repository.port.js';

export {
  assertTechnicianListUnlocked,
  assertUnassignReasonProvided,
} from './job/technician-assignment.js';
export type { TechnicianAssignmentAction } from './job/technician-assignment.js';

export type {
  CommissionMode,
  NewServiceChargeInput,
  UpdateServiceChargeFields,
  ServiceChargeRecord,
  ServiceChargeRepositoryPort,
} from './job/service-charge.repository.port.js';
export {
  assertCommissionModeConsistent,
  createServiceCharge,
  updateServiceCharge,
  toggleServiceCharge,
  listServiceChargesAdmin,
} from './job/service-charge.service.js';

export type {
  NewBrandInput,
  BrandRecord,
  BrandRepositoryPort,
} from './job/brand.repository.port.js';
export {
  normalizeBrandName,
  createBrand,
  toggleBrandActive,
  listBrandsAdmin,
} from './job/brand.service.js';

export type { CancelJobInput, JobCancelRepositoryPort } from './job/job-cancel.repository.port.js';
export { cancelJob } from './job/job-cancel.service.js';

export type {
  UpdateJobDiagnosisInput,
  JobDiagnosisRepositoryPort,
} from './job/job-diagnosis.repository.port.js';
export { updateJobDiagnosis } from './job/job-diagnosis.service.js';

export type {
  UpdateJobDetailsInput,
  JobDetailsRepositoryPort,
} from './job/job-details.repository.port.js';
export { updateJobDetails } from './job/job-details.service.js';

export type {
  NewJobClientInput,
  JobClientRecord,
  JobClientSearchQuery,
  JobClientRepositoryPort,
} from './job/job-client.repository.port.js';

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

export type { ShopIdentity } from './shop/shop-identity.js';

export { buildPaymentReceiptLayout } from './printing/payment-receipt-layout.js';
export type {
  PaymentReceiptData,
  PaymentReceiptLayoutData,
} from './printing/payment-receipt-layout.js';

export { buildCustomerStatementLayout } from './printing/customer-statement-layout.js';
export type {
  CustomerStatementLayoutInput,
  CustomerStatementLayoutData,
  CustomerStatementLayoutRow,
  CustomerStatementRowInput,
} from './printing/customer-statement-layout.js';
