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
}

export interface SaleLineTable {
  id: string;
  tenantId: string;
  saleId: string;
  lineNo: number;
  itemId: string;
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
}
