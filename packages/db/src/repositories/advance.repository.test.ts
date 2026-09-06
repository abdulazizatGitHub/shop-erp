import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import { KyselyPartyRepository } from './party.repository.js';
import { KyselyAdvanceRepository } from './advance.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let partyRepo: KyselyPartyRepository;
let repo: KyselyAdvanceRepository;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-advance-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  const kysely = createKyselyDb(rawDb);
  partyRepo = new KyselyPartyRepository(kysely, TENANT_ID, DEVICE_CODE);
  repo = new KyselyAdvanceRepository(kysely, TENANT_ID, DEVICE_CODE);
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

async function makeStaff(): Promise<{ id: string }> {
  const result = await partyRepo.createStaff({
    name: 'Naeem',
    phone: '0300',
    staffRole: 'technician',
    wageRatePaisa: 60000,
    commissionBp: 0,
  });
  return { id: result.id };
}

describe('KyselyAdvanceRepository.recordAdvance / listAdvances (PHASE_7.md §5 GAP-4, EC-P7-3)', () => {
  it('inserts party_ledger and payment rows correctly — Rs 2,500 -> 250000 paisa', async () => {
    const staff = await makeStaff();

    const result = await repo.recordAdvance({
      staffId: staff.id,
      date: '2026-08-10',
      amountPaisa: 250000,
      notes: 'Eid advance',
    });

    expect(result.docNo).toMatch(/^PMT-/);

    const ledgerRow = rawDb
      .prepare(`SELECT amount, entry_type, party_id FROM party_ledger WHERE id = ?`)
      .get(result.id) as { amount: number; entry_type: string; party_id: string };
    expect(ledgerRow).toEqual({ amount: 250000, entry_type: 'advance', party_id: staff.id });

    const paymentRow = rawDb
      .prepare(`SELECT amount, method, doc_no, direction FROM payment WHERE doc_no = ?`)
      .get(result.docNo) as { amount: number; method: string; doc_no: string; direction: string };
    expect(paymentRow).toEqual({
      amount: 250000,
      method: 'cash',
      doc_no: result.docNo,
      direction: 'out',
    });

    const balanceRow = rawDb
      .prepare(`SELECT balance_paisa FROM v_party_balance WHERE party_id = ?`)
      .get(staff.id) as { balance_paisa: number };
    expect(balanceRow.balance_paisa).toBe(250000);
  });

  it('two advances in the same month sum correctly: Rs 1,000 + Rs 500 = 150000 paisa', async () => {
    const staff = await makeStaff();

    await repo.recordAdvance({
      staffId: staff.id,
      date: '2026-08-03',
      amountPaisa: 100000,
      notes: null,
    });
    await repo.recordAdvance({
      staffId: staff.id,
      date: '2026-08-20',
      amountPaisa: 50000,
      notes: null,
    });

    const advances = await repo.listAdvances({ staffId: staff.id, year: 2026, month: 8 });

    expect(advances).toHaveLength(2);
    const totalPaisa = advances.reduce((sum, a) => sum + a.amountPaisa, 0);
    expect(totalPaisa).toBe(150000);
  });

  it('listAdvances returns only advances in the requested month', async () => {
    const staff = await makeStaff();

    await repo.recordAdvance({
      staffId: staff.id,
      date: '2026-08-15',
      amountPaisa: 100000,
      notes: null,
    });
    await repo.recordAdvance({
      staffId: staff.id,
      date: '2026-09-05',
      amountPaisa: 200000,
      notes: null,
    });

    const augustAdvances = await repo.listAdvances({ staffId: staff.id, year: 2026, month: 8 });
    const septemberAdvances = await repo.listAdvances({ staffId: staff.id, year: 2026, month: 9 });

    expect(augustAdvances).toHaveLength(1);
    expect(augustAdvances[0]?.amountPaisa).toBe(100000);
    expect(septemberAdvances).toHaveLength(1);
    expect(septemberAdvances[0]?.amountPaisa).toBe(200000);
  });

  it('recordAdvance works with notes = null (no notes provided)', async () => {
    const staff = await makeStaff();

    const result = await repo.recordAdvance({
      staffId: staff.id,
      date: '2026-08-07',
      amountPaisa: 50000,
      notes: null,
    });

    expect(result.notes).toBeNull();

    const ledgerRow = rawDb
      .prepare(`SELECT amount FROM party_ledger WHERE id = ?`)
      .get(result.id) as { amount: number };
    expect(ledgerRow.amount).toBe(50000);
  });
});
