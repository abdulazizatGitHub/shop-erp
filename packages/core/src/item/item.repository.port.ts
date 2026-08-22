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
