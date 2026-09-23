/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Phase 16, P16-2 (docs/phases/PHASE_16.md §2c, OD-16-6).
 */
export interface NewBrandInput {
  readonly name: string;
}

export interface BrandRecord {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
}

export interface BrandRepositoryPort {
  /** Rejects a case-insensitive duplicate name for this tenant, including soft-deleted rows (§2c — deleted_at is never re-used to free up a name). */
  createBrand(input: NewBrandInput): Promise<BrandRecord>;
  toggleBrandActive(id: string, isActive: boolean): Promise<BrandRecord>;
  /** Non-deleted brands (active AND inactive) — the Settings Brands admin list. */
  listBrandsAdmin(): Promise<readonly BrandRecord[]>;
}
