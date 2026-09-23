import { ipcMain } from 'electron';
import { CreateBrandInput, ToggleBrandInput, type BrandAdminDto } from '@shop/contracts';
import { createBrand, listBrandsAdmin, toggleBrandActive, type BrandRecord } from '@shop/core';
import {
  createKyselyDb,
  KyselyBrandRepository,
  listActiveBrands,
  openDatabase,
  type BrandOption,
} from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface BrandHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
}

function toDto(record: BrandRecord): BrandAdminDto {
  return { id: record.id, name: record.name, isActive: record.isActive };
}

/** P16-2 — Job Settings' Brands tab + the job-intake brand dropdown. No requirePermission() (PROJECT.md BUG-ADR9), same as every other handler today. */
export function registerBrandHandlers(deps: BrandHandlerDeps): void {
  ipcMain.handle(
    channels.brand.list,
    withError(async (): Promise<readonly BrandOption[]> => {
      const db = openDatabase(deps.dbPath);
      try {
        return await listActiveBrands(createKyselyDb(db), deps.tenantId);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.brand.listAdmin,
    withError(async (): Promise<readonly BrandAdminDto[]> => {
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyBrandRepository(createKyselyDb(db), deps.tenantId);
        const records = await listBrandsAdmin(repo);
        return records.map(toDto);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.brand.create,
    withError(async (_event, raw: unknown): Promise<BrandAdminDto> => {
      const input = CreateBrandInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyBrandRepository(createKyselyDb(db), deps.tenantId);
        return toDto(await createBrand(repo, input));
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.brand.toggleActive,
    withError(async (_event, raw: unknown): Promise<BrandAdminDto> => {
      const input = ToggleBrandInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyBrandRepository(createKyselyDb(db), deps.tenantId);
        return toDto(await toggleBrandActive(repo, input.id, input.isActive));
      } finally {
        db.close();
      }
    }),
  );
}
