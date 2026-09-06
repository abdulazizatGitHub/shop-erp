import { ipcMain } from 'electron';
import { StaffCreateInput, type StaffDto } from '@shop/contracts';
import { createKyselyDb, KyselyPartyRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface StaffHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

export interface CreateStaffResult {
  readonly id: string;
  readonly partyCode: string;
}

/** See job.handler.ts's file header — no requirePermission() (PROJECT.md BUG-ADR9). */
export function registerStaffHandlers(deps: StaffHandlerDeps): void {
  ipcMain.handle(
    channels.staff.create,
    withError(async (_event, raw: unknown): Promise<CreateStaffResult> => {
      const input = StaffCreateInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyPartyRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.createStaff(input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.staff.listStaff,
    withError(async (): Promise<readonly StaffDto[]> => {
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyPartyRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        const rows = await repo.listStaff();
        return rows.map((row): StaffDto => ({
          id: row.id,
          name: row.name,
          phone: row.phone,
          staffRole: row.staffRole,
          wageRatePaisa: row.wageRatePaisa,
          commissionBp: row.commissionBp,
          partyCode: row.partyCode,
          createdAt: row.createdAt,
        }));
      } finally {
        db.close();
      }
    }),
  );
}
