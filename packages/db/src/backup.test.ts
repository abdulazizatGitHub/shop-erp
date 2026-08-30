import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@shop/shared';
import { openDatabase } from './connection.js';
import { migrate } from './migration-runner.js';
import { seed } from './bootstrap.js';
import { createBackup, pruneBackups, restoreBackup } from './backup.js';

const migrationsDir = path.join(import.meta.dirname, 'migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

let workDir: string;
let backupDir: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-backup-test-'));
  backupDir = path.join(workDir, 'backups');
  mkdirSync(backupDir, { recursive: true });
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('pruneBackups', () => {
  it('keeps exactly 30 files, deleting only the single oldest, when 31 exist', () => {
    // 31 backup files named by date, 2026-01-01 through 2026-01-31.
    // maxCount = 30 -> exactly 1 file (the oldest, 2026-01-01) must be
    // deleted; the other 30 must remain untouched.
    const filenames: string[] = [];
    for (let day = 1; day <= 31; day++) {
      const dd = String(day).padStart(2, '0');
      const filename = `ShopERP_backup_2026-01-${dd}.db`;
      filenames.push(filename);
      writeFileSync(path.join(backupDir, filename), 'fake db content');
    }

    const deleted = pruneBackups(backupDir, 30);

    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toBe(path.join(backupDir, 'ShopERP_backup_2026-01-01.db'));
    expect(existsSync(path.join(backupDir, 'ShopERP_backup_2026-01-01.db'))).toBe(false);
    expect(existsSync(path.join(backupDir, 'ShopERP_backup_2026-01-02.db'))).toBe(true);
    expect(existsSync(path.join(backupDir, 'ShopERP_backup_2026-01-31.db'))).toBe(true);
  });

  it('deletes nothing when the count is at or below the limit', () => {
    for (let day = 1; day <= 30; day++) {
      const dd = String(day).padStart(2, '0');
      writeFileSync(path.join(backupDir, `ShopERP_backup_2026-01-${dd}.db`), 'x');
    }

    const deleted = pruneBackups(backupDir, 30);

    expect(deleted).toHaveLength(0);
  });

  it('ignores files that do not match the backup filename pattern', () => {
    writeFileSync(path.join(backupDir, 'ShopERP_backup_2026-01-01.db'), 'x');
    writeFileSync(path.join(backupDir, 'not-a-backup.txt'), 'x');
    writeFileSync(path.join(backupDir, 'pre-migrate-2026-01-01T00-00-00-000Z.db'), 'x');

    const deleted = pruneBackups(backupDir, 0);

    // Only the one real ShopERP_backup_*.db file is eligible for deletion.
    expect(deleted).toEqual([path.join(backupDir, 'ShopERP_backup_2026-01-01.db')]);
    expect(existsSync(path.join(backupDir, 'not-a-backup.txt'))).toBe(true);
    expect(existsSync(path.join(backupDir, 'pre-migrate-2026-01-01T00-00-00-000Z.db'))).toBe(true);
  });
});

describe('createBackup + restoreBackup — real files, real seeded database, no mocks', () => {
  it('backs up a seeded database, then restores it to a DIFFERENT directory with matching row counts on 3 tables', async () => {
    // --- Arrange: a real, migrated, seeded source database ---
    const sourceDbPath = path.join(workDir, 'source.db');
    migrate(sourceDbPath, migrationsDir, path.join(workDir, 'migrate-backups'));
    const sourceDb = openDatabase(sourceDbPath);
    const seedResult = seed(sourceDb, TENANT_ID);
    sourceDb.close();

    // Expected row counts, from the seed's own return value — this is
    // the hand-calculation this checkpoint is verified against, not an
    // assumption about what seed() does.
    // tenant: exactly 1 (seedResult.tenantInserted === true)
    // business_unit: 3 (PARTS/REPAIR/SHARED, seedResult.businessUnitsInserted)
    // uom: seedResult.uomsInserted
    expect(seedResult.tenantInserted).toBe(true);
    expect(seedResult.businessUnitsInserted).toBe(3);

    // --- Act 1: back up the source database ---
    const backupResult = await createBackup(
      sourceDbPath,
      backupDir,
      new Date('2026-08-29T12:00:00Z'),
    );

    expect(existsSync(backupResult.backupPath)).toBe(true);
    expect(path.basename(backupResult.backupPath)).toBe('ShopERP_backup_2026-08-29.db');
    expect(backupResult.sizeBytes).toBeGreaterThan(0);

    // --- Act 2: restore into a DIFFERENT directory, not overwriting the source ---
    const restoreDir = path.join(workDir, 'restored-elsewhere');
    const restoredDbPath = path.join(restoreDir, 'restored.db');
    restoreBackup(backupResult.backupPath, restoredDbPath);

    expect(existsSync(restoredDbPath)).toBe(true);
    expect(restoreDir).not.toBe(path.dirname(sourceDbPath));

    // --- Assert: query the restored file directly, real SQLite reads ---
    const restoredDb: Database.Database = openDatabase(restoredDbPath);
    try {
      const tenantCount = (
        restoredDb.prepare('SELECT COUNT(*) AS n FROM tenant').get() as { n: number }
      ).n;
      const businessUnitCount = (
        restoredDb.prepare('SELECT COUNT(*) AS n FROM business_unit').get() as { n: number }
      ).n;
      const uomCount = (restoredDb.prepare('SELECT COUNT(*) AS n FROM uom').get() as { n: number })
        .n;

      // Hand-calculated expected counts, independent of seedResult's own
      // fields: 1 tenant row; 3 business units (PARTS/REPAIR/SHARED per
      // ADR-0010); 10 UoMs (4 original + 6 added in P3.5E per ADR-0013).
      expect(tenantCount).toBe(1);
      expect(businessUnitCount).toBe(3);
      expect(uomCount).toBe(10);
      // Cross-check against the seed's own return value too.
      expect(businessUnitCount).toBe(seedResult.businessUnitsInserted);
      expect(uomCount).toBe(seedResult.uomsInserted);
    } finally {
      restoredDb.close();
    }
  });

  it('captures a row committed but NOT YET checkpointed out of the WAL file — proves db.backup() beats a raw file copy', async () => {
    // This is the reason createBackup uses db.backup() instead of
    // copyFileSync. In WAL mode a committed row can live only in the
    // .db-wal sidecar file until SQLite decides to checkpoint it into
    // the main .db file. Here the source connection is deliberately
    // kept OPEN (not closed, no explicit checkpoint) while the backup
    // runs, simulating the worst case. A plain copyFileSync of dbPath
    // at this exact moment could miss this row entirely.
    const sourceDbPath = path.join(workDir, 'source-wal.db');
    migrate(sourceDbPath, migrationsDir, path.join(workDir, 'migrate-backups'));
    const liveDb = openDatabase(sourceDbPath);
    seed(liveDb, TENANT_ID);

    const testUomId = newId();
    liveDb
      .prepare(`INSERT INTO uom (id, tenant_id, name, allow_fraction) VALUES (?, ?, ?, ?)`)
      .run(testUomId, TENANT_ID, 'WAL-Test-Uom', 0);
    // liveDb is intentionally still open here — not closed, no manual
    // checkpoint — while createBackup runs below.

    // Precondition check, not decoration: prove the WAL sidecar file
    // genuinely holds un-checkpointed data at this exact moment, so this
    // test is actually exercising the scenario it claims to, not passing
    // vacuously because SQLite already auto-checkpointed on its own.
    const walPath = `${sourceDbPath}-wal`;
    expect(existsSync(walPath)).toBe(true);
    expect(statSync(walPath).size).toBeGreaterThan(0);

    const backupResult = await createBackup(
      sourceDbPath,
      backupDir,
      new Date('2026-08-29T13:00:00Z'),
    );
    liveDb.close();

    const restoredDbPath = path.join(workDir, 'restored-wal-test', 'restored.db');
    restoreBackup(backupResult.backupPath, restoredDbPath);

    const restoredDb = openDatabase(restoredDbPath);
    try {
      const row = restoredDb.prepare(`SELECT name FROM uom WHERE id = ?`).get(testUomId) as
        { name: string } | undefined;
      expect(row).toBeDefined();
      expect(row?.name).toBe('WAL-Test-Uom');
    } finally {
      restoredDb.close();
    }
  });
});
