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

export interface WarehouseTable {
  id: string;
  tenantId: string;
  name: string;
  isDefault: number;
  warehouseKind: string;
  custodianPartyId: string | null;
}

export interface Database {
  item: ItemTable;
  itemPrice: ItemPriceTable;
  documentSequence: DocumentSequenceTable;
  stockMovement: StockMovementTable;
  businessUnit: BusinessUnitTable;
  priceLevel: PriceLevelTable;
  uom: UomTable;
  category: CategoryTable;
  brand: BrandTable;
  warehouse: WarehouseTable;
}
