/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Dependency inversion: core never imports db. See docs/ARCHITECTURE.md
 * section 2, "Why the domain layer is pure."
 */
export interface NewItemInput {
  readonly itemCode: string | null;
  readonly nameEn: string;
  readonly nameUr: string | null;
  readonly businessUnitId: string;
  readonly stockUomId: string;
  readonly trackStock: boolean;
  readonly retailPricePaisa: number;
  // ADR-0013 Type 2 (item-specific alt-unit selling). Absent/undefined
  // means the item sells in stock_uom only — matches CreateItemInput's
  // Zod .optional() fields, not null (null vs. undefined is a needless
  // extra state here since the repository treats "not supplied" the
  // same way regardless).
  readonly altUomId?: string | undefined;
  readonly altUomFactorMilli?: number | undefined;
}

export interface NewItemResult {
  readonly id: string;
  readonly itemCode: string;
}

export interface ItemRecord {
  readonly id: string;
  readonly itemCode: string;
  readonly nameEn: string;
  readonly nameUr: string | null;
  readonly businessUnitId: string | null;
  readonly stockUomId: string;
  readonly retailPricePaisa: number | null;
  readonly trackStock: boolean;
  readonly altUomId: string | null;
  readonly altUomFactorMilli: number | null;
}

export interface ItemSearchQuery {
  readonly query: string;
  readonly categoryId: string | null;
}

export interface ItemRepositoryPort {
  /**
   * Inserts the item and its retail item_price row atomically (one
   * transaction — docs/DATABASE_RULES.md section 2). Generates itemCode
   * via document_sequence when the input's itemCode is null.
   */
  createItem(input: NewItemInput): Promise<NewItemResult>;
  getItemById(id: string): Promise<ItemRecord | null>;
  searchItems(query: ItemSearchQuery): Promise<readonly ItemRecord[]>;
}
