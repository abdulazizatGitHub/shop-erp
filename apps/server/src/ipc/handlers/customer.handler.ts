import { ipcMain } from 'electron';
import {
  CreateCustomerInput,
  CustomerIdInput,
  CustomerSearchInput,
  type CustomerBalanceDto,
  type CustomerDto,
} from '@shop/contracts';
import { createKyselyDb, KyselyPartyRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface CustomerHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

export interface CreateCustomerResult {
  readonly id: string;
  readonly partyCode: string;
}

export function registerCustomerHandlers(deps: CustomerHandlerDeps): void {
  ipcMain.handle(
    channels.customer.create,
    withError(async (_event, raw: unknown): Promise<CreateCustomerResult> => {
      const input = CreateCustomerInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyPartyRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.createCustomer(input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.customer.search,
    withError(async (_event, raw: unknown): Promise<readonly CustomerDto[]> => {
      const input = CustomerSearchInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyPartyRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.searchCustomers(input);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.customer.get,
    withError(async (_event, raw: unknown): Promise<CustomerDto | null> => {
      const input = CustomerIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyPartyRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.getCustomerById(input.id);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.customer.balance,
    withError(async (_event, raw: unknown): Promise<CustomerBalanceDto> => {
      const input = CustomerIdInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyPartyRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
        return await repo.getCustomerBalance(input.id);
      } finally {
        db.close();
      }
    }),
  );
}
