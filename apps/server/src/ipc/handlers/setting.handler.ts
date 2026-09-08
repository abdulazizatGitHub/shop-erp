import { ipcMain } from 'electron';
import {
  DiscountConfigDto,
  SetDiscountApplyWalkinInput,
  SetDiscountApplyWholesaleInput,
  SetDiscountPctEnabledInput,
  SetDiscountPctPresetsInput,
  SetDiscountPkrEnabledInput,
  SetDiscountPkrPresetsInput,
  SetReceiptPaperSizeInput,
  SetShopNameInput,
} from '@shop/contracts';
import {
  createKyselyDb,
  getDiscountApplyWalkin,
  getDiscountApplyWholesale,
  getDiscountPctEnabled,
  getDiscountPctPresets,
  getDiscountPkrEnabled,
  getDiscountPkrPresets,
  getReceiptPaperSize,
  getShopName,
  openDatabase,
  setDiscountApplyWalkin,
  setDiscountApplyWholesale,
  setDiscountPctEnabled,
  setDiscountPctPresets,
  setDiscountPkrEnabled,
  setDiscountPkrPresets,
  setReceiptPaperSize,
  setShopName,
  type ReceiptPaperSize,
} from '@shop/db';
import type { Kysely } from 'kysely';
import type { KyselyDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface SettingHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
}

/** Registers a get/set IPC pair for one boolean setting — reduces boilerplate for the four discount "apply to"/"enabled" flags. */
function registerBooleanSetting(
  deps: SettingHandlerDeps,
  getChannel: string,
  setChannel: string,
  inputSchema: { parse: (raw: unknown) => { value: boolean } },
  getter: (db: Kysely<KyselyDatabase>, tenantId: string) => Promise<boolean>,
  setter: (db: Kysely<KyselyDatabase>, tenantId: string, value: boolean) => Promise<void>,
): void {
  ipcMain.handle(
    getChannel,
    withError(async (): Promise<boolean> => {
      const db = openDatabase(deps.dbPath);
      try {
        return await getter(createKyselyDb(db), deps.tenantId);
      } finally {
        db.close();
      }
    }),
  );
  ipcMain.handle(
    setChannel,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = inputSchema.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        await setter(createKyselyDb(db), deps.tenantId, input.value);
      } finally {
        db.close();
      }
    }),
  );
}

/** Registers a get/set IPC pair for one preset-list setting (PKR or % presets, stored as raw owner-typed strings). */
function registerPresetListSetting(
  deps: SettingHandlerDeps,
  getChannel: string,
  setChannel: string,
  inputSchema: { parse: (raw: unknown) => { value: readonly string[] } },
  getter: (db: Kysely<KyselyDatabase>, tenantId: string) => Promise<readonly string[]>,
  setter: (
    db: Kysely<KyselyDatabase>,
    tenantId: string,
    presets: readonly string[],
  ) => Promise<void>,
): void {
  ipcMain.handle(
    getChannel,
    withError(async (): Promise<readonly string[]> => {
      const db = openDatabase(deps.dbPath);
      try {
        return await getter(createKyselyDb(db), deps.tenantId);
      } finally {
        db.close();
      }
    }),
  );
  ipcMain.handle(
    setChannel,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = inputSchema.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        await setter(createKyselyDb(db), deps.tenantId, input.value);
      } finally {
        db.close();
      }
    }),
  );
}

export function registerSettingHandlers(deps: SettingHandlerDeps): void {
  ipcMain.handle(
    channels.setting.getReceiptPaperSize,
    withError(async (): Promise<ReceiptPaperSize> => {
      const db = openDatabase(deps.dbPath);
      try {
        return await getReceiptPaperSize(createKyselyDb(db), deps.tenantId);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.setting.setReceiptPaperSize,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = SetReceiptPaperSizeInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        await setReceiptPaperSize(createKyselyDb(db), deps.tenantId, input.value);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.setting.getShopName,
    withError(async (): Promise<string> => {
      const db = openDatabase(deps.dbPath);
      try {
        return await getShopName(createKyselyDb(db), deps.tenantId);
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.setting.setShopName,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = SetShopNameInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        await setShopName(createKyselyDb(db), deps.tenantId, input.value);
      } finally {
        db.close();
      }
    }),
  );

  registerBooleanSetting(
    deps,
    channels.setting.getDiscountApplyWalkin,
    channels.setting.setDiscountApplyWalkin,
    SetDiscountApplyWalkinInput,
    getDiscountApplyWalkin,
    setDiscountApplyWalkin,
  );
  registerBooleanSetting(
    deps,
    channels.setting.getDiscountApplyWholesale,
    channels.setting.setDiscountApplyWholesale,
    SetDiscountApplyWholesaleInput,
    getDiscountApplyWholesale,
    setDiscountApplyWholesale,
  );
  registerBooleanSetting(
    deps,
    channels.setting.getDiscountPkrEnabled,
    channels.setting.setDiscountPkrEnabled,
    SetDiscountPkrEnabledInput,
    getDiscountPkrEnabled,
    setDiscountPkrEnabled,
  );
  registerBooleanSetting(
    deps,
    channels.setting.getDiscountPctEnabled,
    channels.setting.setDiscountPctEnabled,
    SetDiscountPctEnabledInput,
    getDiscountPctEnabled,
    setDiscountPctEnabled,
  );
  registerPresetListSetting(
    deps,
    channels.setting.getDiscountPkrPresets,
    channels.setting.setDiscountPkrPresets,
    SetDiscountPkrPresetsInput,
    getDiscountPkrPresets,
    setDiscountPkrPresets,
  );
  registerPresetListSetting(
    deps,
    channels.setting.getDiscountPctPresets,
    channels.setting.setDiscountPctPresets,
    SetDiscountPctPresetsInput,
    getDiscountPctPresets,
    setDiscountPctPresets,
  );

  // settings:getDiscountConfig — single combined read for the sale screen
  // (D-2). PKR presets are stored as raw PKR strings (owner-typed); this is
  // the one place that converts them to paisa, so neither the repository
  // nor the renderer ever does that math. Each raw setting is re-validated
  // here (via .safeParse against the numeric-string regex) rather than
  // trusted blindly, even though the repository already defends against a
  // malformed/missing row — belt-and-braces at the IPC boundary per
  // CLAUDE.md's "validate external input at the boundary" rule.
  const PresetAmountString = SetDiscountPkrPresetsInput.shape.value.element;
  ipcMain.handle(
    channels.setting.getDiscountConfig,
    withError(async (): Promise<DiscountConfigDto> => {
      const db = openDatabase(deps.dbPath);
      const kdb = createKyselyDb(db);
      try {
        const [
          applyToWalkin,
          applyToWholesale,
          pkrEnabled,
          pctEnabled,
          rawPkrPresets,
          rawPctPresets,
        ] = await Promise.all([
          getDiscountApplyWalkin(kdb, deps.tenantId),
          getDiscountApplyWholesale(kdb, deps.tenantId),
          getDiscountPkrEnabled(kdb, deps.tenantId),
          getDiscountPctEnabled(kdb, deps.tenantId),
          getDiscountPkrPresets(kdb, deps.tenantId),
          getDiscountPctPresets(kdb, deps.tenantId),
        ]);
        const pkrPresets = rawPkrPresets
          .filter((raw) => PresetAmountString.safeParse(raw).success)
          .map((raw) => Math.round(Number(raw) * 100));
        const pctPresets = rawPctPresets
          .filter((raw) => PresetAmountString.safeParse(raw).success)
          .map((raw) => Number(raw));
        return DiscountConfigDto.parse({
          applyToWalkin,
          applyToWholesale,
          pkrEnabled,
          pkrPresets,
          pctEnabled,
          pctPresets,
        });
      } finally {
        db.close();
      }
    }),
  );
}
