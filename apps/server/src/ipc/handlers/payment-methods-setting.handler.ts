import { ipcMain } from 'electron';
import {
  SetPaymentMethodBankEnabledInput,
  SetPaymentMethodCashEnabledInput,
  SetPaymentMethodChequeEnabledInput,
  SetPaymentMethodEasypaisaEnabledInput,
  SetPaymentMethodJazzcashEnabledInput,
  type PaymentMethodsEnabledDto,
} from '@shop/contracts';
import {
  createKyselyDb,
  getPaymentMethodsEnabled,
  openDatabase,
  setPaymentMethodBankEnabled,
  setPaymentMethodCashEnabled,
  setPaymentMethodChequeEnabled,
  setPaymentMethodEasypaisaEnabled,
  setPaymentMethodJazzcashEnabled,
} from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface PaymentMethodsSettingHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
}

/**
 * P17-7 (docs/phases/PHASE_17.md §2.6, S17-EXP-4). Own file, same
 * "extracted before setting.handler.ts crosses ~300 lines" convention
 * as stock-alerts-setting.handler.ts/reports-display-setting.handler.ts.
 *
 * A17-5 — cash can never be disabled, enforced here (the save path),
 * not just by PaymentMethodsSettingsSection.tsx's own disabled toggle:
 * SetPaymentMethodCashEnabledInput's Zod schema only accepts
 * `{ value: true }`, so a `false` payload fails `.parse()` before this
 * handler's body — let alone the repository — ever runs. Same
 * "validate external input with Zod at the boundary" rule as every
 * other IPC handler (CLAUDE.md §9), not a special case bolted on here.
 *
 * Hiding a method is picker-only (PaymentMethodToggle.tsx reads
 * getPaymentMethodsEnabled to decide what to show/fall back to) — this
 * setting is NEVER read or enforced anywhere in the sale/payment write
 * path. `CreatePaymentInput['method']` stays the exact same closed Zod
 * union it always was, and disabling a method never touches any
 * stored historical `payment.method` value.
 */
export function registerPaymentMethodsSettingHandlers(
  deps: PaymentMethodsSettingHandlerDeps,
): void {
  ipcMain.handle(
    channels.setting.getPaymentMethodsEnabled,
    withError(async (): Promise<PaymentMethodsEnabledDto> => {
      const db = openDatabase(deps.dbPath);
      try {
        return await getPaymentMethodsEnabled(createKyselyDb(db), deps.tenantId);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.setting.setPaymentMethodCashEnabled,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = SetPaymentMethodCashEnabledInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        await setPaymentMethodCashEnabled(createKyselyDb(db), deps.tenantId, input.value);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.setting.setPaymentMethodBankEnabled,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = SetPaymentMethodBankEnabledInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        await setPaymentMethodBankEnabled(createKyselyDb(db), deps.tenantId, input.value);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.setting.setPaymentMethodEasypaisaEnabled,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = SetPaymentMethodEasypaisaEnabledInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        await setPaymentMethodEasypaisaEnabled(createKyselyDb(db), deps.tenantId, input.value);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.setting.setPaymentMethodJazzcashEnabled,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = SetPaymentMethodJazzcashEnabledInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        await setPaymentMethodJazzcashEnabled(createKyselyDb(db), deps.tenantId, input.value);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.setting.setPaymentMethodChequeEnabled,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = SetPaymentMethodChequeEnabledInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        await setPaymentMethodChequeEnabled(createKyselyDb(db), deps.tenantId, input.value);
      } finally {
        db.close();
      }
    }),
  );
}
