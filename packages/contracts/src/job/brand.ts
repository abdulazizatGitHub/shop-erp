import { z } from 'zod';

export const CreateBrandInput = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateBrandInput = z.infer<typeof CreateBrandInput>;

export const ToggleBrandInput = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});
export type ToggleBrandInput = z.infer<typeof ToggleBrandInput>;

/** Settings Brands admin list row — non-deleted, active AND inactive. */
export const BrandAdminDto = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isActive: z.boolean(),
});
export type BrandAdminDto = z.infer<typeof BrandAdminDto>;
