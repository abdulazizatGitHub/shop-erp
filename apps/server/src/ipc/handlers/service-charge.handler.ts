import { ipcMain } from 'electron';
import {
  CreateServiceChargeInput,
  ToggleServiceChargeInput,
  UpdateServiceChargeInput,
  type ServiceChargeAdminDto,
} from '@shop/contracts';
import {
  createServiceCharge,
  listServiceChargesAdmin,
  toggleServiceCharge,
  updateServiceCharge,
  type ServiceChargeRecord,
} from '@shop/core';
import { createKyselyDb, KyselyServiceChargeRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface ServiceChargeHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
}

function toDto(record: ServiceChargeRecord): ServiceChargeAdminDto {
  return {
    id: record.id,
    name: record.name,
    jobType: record.jobType,
    retailChargePaisa: record.retailChargePaisa,
    wholesaleChargePaisa: record.wholesaleChargePaisa,
    commissionMode: record.commissionMode,
    commissionAmountPaisa: record.commissionAmountPaisa,
    commissionBp: record.commissionBp,
    typicalMinutes: record.typicalMinutes,
    isActive: record.isActive,
    notes: record.notes,
    createdAt: record.createdAt,
  };
}

/** P16-1 — Job Settings' Service Charges tab. No requirePermission() (PROJECT.md BUG-ADR9), same as every other handler today. */
export function registerServiceChargeHandlers(deps: ServiceChargeHandlerDeps): void {
  ipcMain.handle(
    channels.job.listServiceChargesAdmin,
    withError(async (): Promise<readonly ServiceChargeAdminDto[]> => {
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyServiceChargeRepository(createKyselyDb(db), deps.tenantId);
        const records = await listServiceChargesAdmin(repo);
        return records.map(toDto);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.job.createServiceCharge,
    withError(async (_event, raw: unknown): Promise<ServiceChargeAdminDto> => {
      const input = CreateServiceChargeInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyServiceChargeRepository(createKyselyDb(db), deps.tenantId);
        return toDto(await createServiceCharge(repo, input));
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.job.updateServiceCharge,
    withError(async (_event, raw: unknown): Promise<ServiceChargeAdminDto> => {
      const input = UpdateServiceChargeInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyServiceChargeRepository(createKyselyDb(db), deps.tenantId);
        return toDto(await updateServiceCharge(repo, input));
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.job.toggleServiceCharge,
    withError(async (_event, raw: unknown): Promise<ServiceChargeAdminDto> => {
      const input = ToggleServiceChargeInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyServiceChargeRepository(createKyselyDb(db), deps.tenantId);
        return toDto(await toggleServiceCharge(repo, input.id, input.isActive));
      } finally {
        db.close();
      }
    }),
  );
}
