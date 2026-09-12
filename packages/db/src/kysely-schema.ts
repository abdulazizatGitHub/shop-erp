/**
 * Kysely table types. Columns use camelCase — CamelCasePlugin (see
 * kysely-db.ts) maps to the real snake_case DB columns transparently.
 * This is where snake_case <-> camelCase mapping happens, per
 * docs/CODING_STANDARDS.md section 2.
 *
 * Only tables Phase 1 actually touches are declared. Add more as needed —
 * this is not meant to mirror the whole schema up front.
 */

export interface ItemTable {
  id: string;
  tenantId: string;
  itemCode: string;
  nameEn: string;
  nameUr: string | null;
  categoryId: string | null;
  brandId: string | null;
  variantLabel: string | null;
  businessUnitId: string | null;
  stockUomId: string;
  purchaseUomId: string | null;
  purchaseToStockFactor: number;
  itemType: string;
  trackStock: number;
  isSerialized: number;
  isReturnableContainer: number;
  lastPurchaseCost: number | null;
  avgCost: number | null;
  reorderLevel: number | null;
  shelfLocation: string | null;
  defaultTaxRate: number;
  isActive: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  altUomId: string | null;
  altUomFactorMilli: number | null;
}

export interface ItemPriceTable {
  id: string;
  tenantId: string;
  itemId: string;
  priceLevelId: string;
  price: number;
  effectiveFrom: string;
  createdAt: string;
}

export interface DocumentSequenceTable {
  tenantId: string;
  docType: string;
  prefix: string;
  deviceCode: string;
  nextNumber: number;
}

export interface StockMovementTable {
  id: string;
  tenantId: string;
  itemId: string;
  warehouseId: string;
  movementDate: string;
  movementType: string;
  quantity: number;
  unitCost: number | null;
  serialId: string | null;
  sourceType: string | null;
  sourceId: string | null;
  reason: string | null;
  reversedById: string | null;
  createdAt: string;
  createdBy: string | null;
  businessUnitId: string | null;
}

export interface BusinessUnitTable {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  ownsStock: number;
  earnsLabour: number;
  isOverhead: number;
  isActive: number;
  sortOrder: number;
  createdAt: string;
}

export interface PriceLevelTable {
  id: string;
  tenantId: string;
  name: string;
  isDefault: number;
  marginBp: number | null;
  sortOrder: number;
}

export interface UomTable {
  id: string;
  tenantId: string;
  name: string;
  allowFraction: number;
}

export interface CategoryTable {
  id: string;
  tenantId: string;
  name: string;
  sortOrder: number;
  deletedAt: string | null;
}

export interface BrandTable {
  id: string;
  tenantId: string;
  name: string;
  deletedAt: string | null;
}

export interface SettingTable {
  tenantId: string;
  key: string;
  value: string | null;
  updatedAt: string;
}

export interface WarehouseTable {
  id: string;
  tenantId: string;
  name: string;
  isDefault: number;
  warehouseKind: string;
  custodianPartyId: string | null;
}

export interface PartyTable {
  id: string;
  tenantId: string;
  partyCode: string;
  partyType: string;
  name: string;
  shopName: string | null;
  phone: string | null;
  address: string | null;
  cityArea: string | null;
  paymentTerms: string | null;
  // customer-specific — added P3-1. See 0001_init.sql's party table.
  customerType: string | null;
  priceLevelId: string | null;
  creditLimit: number | null;
  // staff-specific — added P6-8/Phase 7. See 0001_init.sql's party table.
  staffRole: string | null;
  wageRate: number | null;
  commissionBp: number | null;
  notes: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PurchaseTable {
  id: string;
  tenantId: string;
  docNo: string;
  supplierId: string;
  warehouseId: string;
  purchaseDate: string;
  supplierInvoiceNo: string | null;
  subtotal: number;
  discountAmount: number;
  freightAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  paymentMode: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  businessUnitId: string | null;
}

export interface PurchaseLineTable {
  id: string;
  tenantId: string;
  purchaseId: string;
  lineNo: number;
  itemId: string;
  quantity: number;
  stockQuantity: number;
  unitCost: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  notes: string | null;
}

export interface SaleTable {
  id: string;
  tenantId: string;
  docNo: string;
  customerId: string | null;
  warehouseId: string;
  priceLevelId: string;
  saleDate: string;
  saleType: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  paymentMode: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  jobId: string | null;
}

export interface SaleLineTable {
  id: string;
  tenantId: string;
  saleId: string;
  lineNo: number;
  itemId: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  unitCost: number | null;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  businessUnitId: string | null;
  saleUomId: string | null;
  saleToStockFactor: number | null;
  lineKind: string;
  jobPartId: string | null;
  serviceChargeId: string | null;
  payerPartyId: string | null;
  revenueType: string;
}

export interface PartyLedgerTable {
  id: string;
  tenantId: string;
  partyId: string;
  entryDate: string;
  entryType: string;
  amount: number;
  runningNote: string | null;
  sourceType: string | null;
  sourceId: string | null;
  reversedById: string | null;
  createdAt: string;
  createdBy: string | null;
  billReference: string | null;
  dueDate: string | null;
  billNotes: string | null;
}

export interface PaymentTable {
  id: string;
  tenantId: string;
  docNo: string;
  direction: string;
  partyId: string;
  paymentDate: string;
  amount: number;
  method: string;
  referenceNo: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface AuditLogTable {
  id: string;
  tenantId: string;
  tableName: string;
  recordId: string;
  action: string;
  changedFields: string | null;
  oldValues: string | null;
  userId: string | null;
  deviceCode: string | null;
  createdAt: string;
}

export interface SyncOutboxTable {
  id: string;
  tenantId: string;
  tableName: string;
  recordId: string;
  operation: string;
  payload: string | null;
  createdAt: string;
  syncedAt: string | null;
  syncAttempts: number;
  lastError: string | null;
}

export interface UomConversionTable {
  id: string;
  tenantId: string;
  fromUomId: string;
  toUomId: string;
  factorMilli: number;
}

export interface JobTable {
  id: string;
  tenantId: string;
  docNo: string;
  customerId: string | null;
  customerNameAdhoc: string | null;
  customerPhone: string | null;
  jobType: string;
  applianceType: string | null;
  applianceBrand: string | null;
  applianceModel: string | null;
  applianceSerial: string | null;
  reportedFault: string | null;
  accessoriesReceived: string | null;
  receivedDate: string;
  promisedDate: string | null;
  estimateAmount: number | null;
  estimateApproved: number;
  assignedTo: string | null;
  status: string;
  diagnosis: string | null;
  workDone: string | null;
  labourCharge: number;
  partsCost: number;
  totalCharge: number;
  warrantyDays: number;
  isWarrantyRework: number;
  parentJobId: string | null;
  deliveredDate: string | null;
  saleId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  businessUnitId: string | null;
  billToPartyId: string | null;
  revenueType: string;
  contractId: string | null;
  claimReference: string | null;
  claimStatus: string | null;
}

export interface JobPartTable {
  id: string;
  tenantId: string;
  jobId: string;
  itemId: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  serialId: string | null;
  isReturned: number;
  issuedAt: string;
  issuedBy: string | null;
  businessUnitId: string | null;
  isBillable: number;
  entryType: string;
  reversesJobPartId: string | null;
}

export interface ServiceChargeTable {
  id: string;
  tenantId: string;
  businessUnitId: string;
  name: string;
  jobType: string | null;
  retailCharge: number;
  wholesaleCharge: number | null;
  commissionAmount: number | null;
  commissionBp: number | null;
  typicalMinutes: number | null;
  isActive: number;
  notes: string | null;
  createdAt: string;
}

export interface InternalTransferTable {
  id: string;
  tenantId: string;
  docNo: string;
  transferDate: string;
  fromUnitId: string;
  toUnitId: string;
  reason: string;
  jobId: string | null;
  valuationMethod: string;
  totalAmount: number;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface InternalTransferLineTable {
  id: string;
  tenantId: string;
  transferId: string;
  itemId: string;
  quantity: number;
  unitValue: number;
  lineTotal: number;
}

export interface CustodyReconciliationTable {
  id: string;
  tenantId: string;
  warehouseId: string;
  custodianPartyId: string;
  reconciledOn: string;
  shortageValue: number;
  actionTaken: string;
  ledgerEntryId: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface JobStatusHistoryTable {
  id: string;
  tenantId: string;
  jobId: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: string;
  changedBy: string | null;
  note: string | null;
}

/** See 0001_init.sql's cash_session table. Phase 7. Not append-only — the close path updates the same row (PHASE_7.md §5 Correction 2). */
export interface CashSessionTable {
  id: string;
  tenantId: string;
  sessionDate: string;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  expectedCash: number | null;
  countedCash: number | null;
  difference: number | null;
  openedBy: string | null;
  closedBy: string | null;
  notes: string | null;
}

/** See 0001_init.sql's expense_category table + 0003_shared_overhead.sql's ALTER. Phase 7. */
export interface ExpenseCategoryTable {
  id: string;
  tenantId: string;
  name: string;
  kind: string;
  isBillable: number;
  isOwnerDrawing: number;
  sortOrder: number;
  deletedAt: string | null;
  allocationMethod: string;
  partsShareBp: number | null;
}

/**
 * See 0001_init.sql's expense table + 0002_business_units.sql's ALTER.
 * Phase 7. Note: the live DDL's free-text column is `description`, not
 * `notes` — the contracts-layer DTO/input still use `notes`, mapped in
 * expense.repository.ts, same convention as party.wage_rate <-> wageRatePaisa.
 */
export interface ExpenseTable {
  id: string;
  tenantId: string;
  docNo: string;
  categoryId: string;
  expenseDate: string;
  amount: number;
  paidTo: string | null;
  partyId: string | null;
  method: string;
  referenceNo: string | null;
  jobId: string | null;
  saleId: string | null;
  vehicle: string | null;
  description: string | null;
  receiptPath: string | null;
  createdAt: string;
  createdBy: string | null;
  businessUnitId: string | null;
}

/** See 0001_init.sql's attendance table + 0003_shared_overhead.sql's ALTER. Phase 7. */
export interface AttendanceTable {
  id: string;
  tenantId: string;
  staffId: string;
  attendanceDate: string;
  status: string;
  hoursWorked: number | null;
  overtimeHours: number | null;
  wageEarned: number;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
  businessUnitId: string | null;
}

/** See 0014_purchase_order_grn.sql. Phase 9. No prices, no stock/ledger impact. */
export interface PurchaseOrderTable {
  id: string;
  tenantId: string;
  docNo: string;
  supplierPartyId: string | null;
  supplierNote: string | null;
  orderDate: string;
  expectedDelivery: string | null;
  notes: string | null;
  status: string; // draft | sent | partially_received | fully_received | cancelled
  createdAt: string;
  updatedAt: string;
}

/** See 0014_purchase_order_grn.sql. Phase 9. */
export interface PurchaseOrderLineTable {
  id: string;
  tenantId: string;
  purchaseOrderId: string;
  itemId: string;
  quantityOrderedMilli: number;
  quantityReceivedMilli: number;
  notes: string | null;
}

/** See 0014_purchase_order_grn.sql. Phase 9. Stock and party_ledger post here, not on purchase_order. */
export interface GrnTable {
  id: string;
  tenantId: string;
  docNo: string;
  purchaseOrderId: string;
  supplierPartyId: string | null;
  supplierBillRef: string | null;
  grnDate: string;
  paymentMode: string; // cash | credit
  status: string; // confirmed | cancelled
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** See 0014_purchase_order_grn.sql. Phase 9. purchaseOrderLineId null = unplanned receipt. */
export interface GrnLineTable {
  id: string;
  tenantId: string;
  grnId: string;
  purchaseOrderLineId: string | null;
  itemId: string;
  quantityReceivedMilli: number;
  unitCostPaisa: number;
  sellingPricePaisa: number;
  wholesalePricePaisa: number | null;
}

/** See 0014_purchase_order_grn.sql. Phase 9. Permanent, never rolled back by a GRN cancellation. */
export interface ItemPriceHistoryTable {
  id: string;
  tenantId: string;
  itemId: string;
  priceType: string; // purchase_cost | retail | wholesale
  oldValuePaisa: number;
  newValuePaisa: number;
  changedAt: string;
  sourceType: string; // 'grn'
  sourceId: string;
}

export interface Database {
  item: ItemTable;
  itemPrice: ItemPriceTable;
  documentSequence: DocumentSequenceTable;
  stockMovement: StockMovementTable;
  businessUnit: BusinessUnitTable;
  priceLevel: PriceLevelTable;
  uom: UomTable;
  uomConversion: UomConversionTable;
  category: CategoryTable;
  brand: BrandTable;
  warehouse: WarehouseTable;
  party: PartyTable;
  sale: SaleTable;
  saleLine: SaleLineTable;
  purchase: PurchaseTable;
  purchaseLine: PurchaseLineTable;
  partyLedger: PartyLedgerTable;
  payment: PaymentTable;
  auditLog: AuditLogTable;
  syncOutbox: SyncOutboxTable;
  setting: SettingTable;
  job: JobTable;
  jobPart: JobPartTable;
  jobStatusHistory: JobStatusHistoryTable;
  serviceCharge: ServiceChargeTable;
  internalTransfer: InternalTransferTable;
  internalTransferLine: InternalTransferLineTable;
  custodyReconciliation: CustodyReconciliationTable;
  attendance: AttendanceTable;
  expenseCategory: ExpenseCategoryTable;
  expense: ExpenseTable;
  cashSession: CashSessionTable;
  purchaseOrder: PurchaseOrderTable;
  purchaseOrderLine: PurchaseOrderLineTable;
  grn: GrnTable;
  grnLine: GrnLineTable;
  itemPriceHistory: ItemPriceHistoryTable;
}
