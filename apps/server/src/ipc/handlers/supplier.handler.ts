import { ipcMain } from 'electron';
import {
  CreateSupplierInput,
  SupplierIdInput,
  SupplierSearchInput,
  type SupplierBalanceDto,
  type SupplierDto,
} from '@shop/contracts';
import { createKyselyDb, KyselyPartyRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface SupplierHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

export interface CreateSupplierResult {
  readonly id: string;
  readonly partyCode: string;
}

export function registerSupplierHandlers(deps: SupplierHandlerDeps): void {
  ipcMain.handle(
    channels.party.create,
    withError(async (_event, raw: unknown): Promise<CreateSupplierResult> => {
      const input = CreateSupplierInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyPartyRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.createSupplier(input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.party.search,
    withError(async (_event, raw: unknown): Promise<readonly SupplierDto[]> => {
      const input = SupplierSearchInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyPartyRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.searchSuppliers(input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.party.get,
    withError(async (_event, raw: unknown): Promise<SupplierDto | null> => {
      const input = SupplierIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyPartyRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.getSupplierById(input.id);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.party.balance,
    withError(async (_event, raw: unknown): Promise<SupplierBalanceDto> => {
      const input = SupplierIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyPartyRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.getSupplierBalance(input.id);
      } finally {
        db.close();
      }
    }),
  );
}
