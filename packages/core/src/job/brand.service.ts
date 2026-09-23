import type { CreateBrandInput } from '@shop/contracts';
import type { BrandRecord, BrandRepositoryPort } from './brand.repository.port.js';

/**
 * OD-16-6 — "trimmed, internal spaces collapsed". A pure function so it's
 * testable without a DB and reused identically by both create and (a
 * future) rename path — collapses "Changhong   Ruba" -> "Changhong Ruba",
 * never touches case.
 */
export function normalizeBrandName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export async function createBrand(
  repo: BrandRepositoryPort,
  input: CreateBrandInput,
): Promise<BrandRecord> {
  return repo.createBrand({ name: normalizeBrandName(input.name) });
}

export async function toggleBrandActive(
  repo: BrandRepositoryPort,
  id: string,
  isActive: boolean,
): Promise<BrandRecord> {
  return repo.toggleBrandActive(id, isActive);
}

export async function listBrandsAdmin(repo: BrandRepositoryPort): Promise<readonly BrandRecord[]> {
  return repo.listBrandsAdmin();
}
