import { ipcMain } from 'electron';
import { CreatePaymentInput, type PaymentDto } from '@shop/contracts';
import { createKyselyDb, KyselyPaymentRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface PaymentHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

/** Customer payments only (P3-3 scope) — supplier payments out are Phase 4/8. */
export function registerPaymentHandlers(deps: PaymentHandlerDeps): void {
  ipcMain.handle(
    channels.payment.receive,
    withError(async (_event, raw: unknown): Promise<PaymentDto> => {
      const input = CreatePaymentInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyPaymentRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await repo.createPayment(input);
      } finally {
        db.close();
      }
    }),
  );
}
