import { z } from 'zod';

/**
 * Manual item creation via the admin CRUD screen — the P1-1 minimum field
 * set. Import rows (P1-2) accept a larger, mostly-optional field set and
 * have their own schema; this one is deliberately narrow.
 */
export const CreateItemInput = z.object({
  itemCode: z.string().trim().min(1).nullable(),
  nameEn: z.string().trim().min(1),
  nameUr: z.string().trim().min(1).nullable(),
  businessUnitId: z.string().uuid(),
  stockUomId: z.string().uuid(),
  retailPricePaisa: z.number().int().nonnegative(),
  trackStock: z.boolean().default(true),
});
export type CreateItemInput = z.infer<typeof CreateItemInput>;

export const UpdateItemInput = CreateItemInput.partial().extend({
  id: z.string().uuid(),
});
export type UpdateItemInput = z.infer<typeof UpdateItemInput>;

export const ItemSearchInput = z.object({
  query: z.string().trim().default(''),
  categoryId: z.string().uuid().nullable().default(null),
});
export type ItemSearchInput = z.infer<typeof ItemSearchInput>;

export const ItemDto = z.object({
  id: z.string().uuid(),
  itemCode: z.string(),
  nameEn: z.string(),
  nameUr: z.string().nullable(),
  // Nullable: the item.business_unit_id column is nullable in the schema
  // (older/edge-case rows), and retailPricePaisa comes from a LEFT JOIN
  // to item_price — both can legitimately be absent even though
  // CreateItemInput always supplies them for items created through P1-1.
  businessUnitId: z.string().uuid().nullable(),
  stockUomId: z.string().uuid(),
  retailPricePaisa: z.number().int().nullable(),
  trackStock: z.boolean(),
});
export type ItemDto = z.infer<typeof ItemDto>;

/** Reference-data options for populating the item form's dropdowns. */
export interface ItemLookups {
  readonly businessUnits: readonly {
    readonly id: string;
    readonly code: string;
    readonly name: string;
  }[];
  readonly uoms: readonly { readonly id: string; readonly name: string }[];
  readonly categories: readonly { readonly id: string; readonly name: string }[];
}
