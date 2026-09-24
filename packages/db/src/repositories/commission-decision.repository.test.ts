import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { Kysely } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '@shop/shared';
import { openDatabase } from '../connection.js';
import { migrate } from '../migration-runner.js';
import { seed } from '../bootstrap.js';
import { createKyselyDb } from '../kysely-db.js';
import type { Database as Schema } from '../kysely-schema.js';
import { KyselyPartyRepository } from './party.repository.js';
import { KyselyJobDeliveryRepository } from './job-delivery.repository.js';
import { KyselyCommissionDecisionRepository } from './commission-decision.repository.js';

const migrationsDir = path.join(import.meta.dirname, '../migrations');
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEVICE_CODE = 'A';

let workDir: string;
let dbPath: string;
let rawDb: Database.Database;
let kysely: Kysely<Schema>;
let partyRepo: KyselyPartyRepository;
let deliveryRepo: KyselyJobDeliveryRepository;
let decisionRepo: KyselyCommissionDecisionRepository;

let repairUnitId: string;
let customerId: string;
let commissionChargeId: string;
let technicianAId: string;
let technicianBId: string;
let outsideStaffId: string;

function insertJob(): string {
  const jobId = newId();
  const now = new Date().toISOString();
  rawDb
    .prepare(
      `INSERT INTO job (id, tenant_id, doc_no, customer_id, job_type, received_date, status, labour_charge, parts_cost, total_charge, warranty_days, is_warranty_rework, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'in_shop', '2026-09-24', 'received', 0, 0, 0, 0, 0, ?, ?)`,
    )
    .run(jobId, TENANT_ID, `JOB-${jobId.slice(0, 4)}`, customerId, now, now);
  rawDb
    .prepare(
      `INSERT INTO job_status_history (id, tenant_id, job_id, from_status, to_status, changed_at)
       VALUES (?, ?, ?, NULL, 'received', ?)`,
    )
    .run(newId(), TENANT_ID, jobId, now);
  return jobId;
}

function assignTechnician(jobId: string, partyId: string, assignedAt: string): void {
  rawDb
    .prepare(
      `INSERT INTO job_technician (id, tenant_id, job_id, party_id, assigned_at, unassigned_at, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    )
    .run(newId(), TENANT_ID, jobId, partyId, assignedAt, new Date().toISOString());
}

/** Delivers a job with one commission-configured labour line, returning the resulting claimId. */
async function deliverAndGetClaimId(jobId: string): Promise<string> {
  await deliveryRepo.deliverJob({
    jobId,
    saleDate: '2026-09-24',
    partLines: [],
    labourLines: [
      {
        serviceChargeId: commissionChargeId,
        unitPricePaisa: null,
        payerPartyId: customerId,
        revenueType: 'customer_paid',
      },
    ],
    paidPaisa: 0,
  });
  const claim = rawDb.prepare(`SELECT id FROM commission_claim WHERE job_id = ?`).get(jobId) as {
    id: string;
  };
  return claim.id;
}

function ledgerRowsFor(partyId: string): Array<{
  amount: number;
  entry_type: string;
  source_type: string;
  source_id: string;
  entry_date: string;
}> {
  return rawDb
    .prepare(
      `SELECT amount, entry_type, source_type, source_id, entry_date FROM party_ledger WHERE party_id = ? ORDER BY created_at`,
    )
    .all(partyId) as Array<{
    amount: number;
    entry_type: string;
    source_type: string;
    source_id: string;
    entry_date: string;
  }>;
}

beforeEach(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-commission-decision-repo-test-'));
  dbPath = path.join(workDir, 'test.db');
  migrate(dbPath, migrationsDir, path.join(workDir, 'backups'));
  rawDb = openDatabase(dbPath);
  seed(rawDb, TENANT_ID);

  kysely = createKyselyDb(rawDb);
  partyRepo = new KyselyPartyRepository(kysely, TENANT_ID, DEVICE_CODE);
  deliveryRepo = new KyselyJobDeliveryRepository(kysely, TENANT_ID, DEVICE_CODE);
  decisionRepo = new KyselyCommissionDecisionRepository(kysely, TENANT_ID, DEVICE_CODE);

  repairUnitId = (
    rawDb
      .prepare(`SELECT id FROM business_unit WHERE tenant_id = ? AND code = 'REPAIR'`)
      .get(TENANT_ID) as { id: string }
  ).id;

  const customer = await partyRepo.createCustomer({
    partyCode: null,
    name: 'Ahmad',
    shopName: null,
    phone: null,
    address: null,
    customerType: 'retail',
    priceLevelId: null,
    creditLimitPaisa: null,
    notes: null,
  });
  customerId = customer.id;

  const technicianA = await partyRepo.createStaff({
    name: 'Naeem',
    phone: '0300',
    staffRole: 'technician',
    wageRatePaisa: 60000,
    commissionBp: 0,
  });
  technicianAId = technicianA.id;
  const technicianB = await partyRepo.createStaff({
    name: 'Bilal',
    phone: '0301',
    staffRole: 'technician',
    wageRatePaisa: 60000,
    commissionBp: 0,
  });
  technicianBId = technicianB.id;
  const outsideStaff = await partyRepo.createStaff({
    name: 'Zafar (senior, not on this job)',
    phone: '0302',
    staffRole: 'technician',
    wageRatePaisa: 70000,
    commissionBp: 0,
  });
  outsideStaffId = outsideStaff.id;

  commissionChargeId = newId();
  rawDb
    .prepare(
      `INSERT INTO service_charge (id, tenant_id, business_unit_id, name, retail_charge, commission_amount, is_active, created_at)
       VALUES (?, ?, ?, 'AC Installation', 300000, 50000, 1, ?)`,
    )
    .run(commissionChargeId, TENANT_ID, repairUnitId, new Date().toISOString());
});

afterEach(() => {
  rawDb.close();
  rmSync(workDir, { recursive: true, force: true });
});

describe('KyselyCommissionDecisionRepository.approveClaim', () => {
  it('approves 50000 to one in-history technician — one commission_decision (attemptNo=1), one recipient row, one party_ledger row amount=-50000', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    const claimId = await deliverAndGetClaimId(jobId);

    const decision = await decisionRepo.approveClaim({
      claimId,
      recipients: [
        { technicianPartyId: technicianAId, amountPaisa: 50000, outsideHistoryReason: null },
      ],
      decidedAt: '2026-09-25',
    });

    expect(decision.attemptNo).toBe(1);
    expect(decision.decision).toBe('approved');
    expect(decision.recipients).toHaveLength(1);

    const rows = ledgerRowsFor(technicianAId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amount: -50000,
      entry_type: 'commission',
      source_type: 'commission_decision',
      source_id: decision.id,
      entry_date: '2026-09-25',
    });
  });

  it('approve 30000 + 20000 to two in-history technicians (one active, one later removed) -> two party_ledger rows, sum 50000, one decision, two recipient rows', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    assignTechnician(jobId, technicianBId, '2026-09-24T09:00:00.000Z');
    // Remove B after assignment but still "in history" per OD-16-3.
    rawDb
      .prepare(`UPDATE job_technician SET unassigned_at = ? WHERE job_id = ? AND party_id = ?`)
      .run('2026-09-24T10:00:00.000Z', jobId, technicianBId);
    const claimId = await deliverAndGetClaimId(jobId);

    const decision = await decisionRepo.approveClaim({
      claimId,
      recipients: [
        { technicianPartyId: technicianAId, amountPaisa: 30000, outsideHistoryReason: null },
        { technicianPartyId: technicianBId, amountPaisa: 20000, outsideHistoryReason: null },
      ],
      decidedAt: '2026-09-25',
    });

    expect(decision.attemptNo).toBe(1);
    expect(decision.recipients).toHaveLength(2);

    const rowsA = ledgerRowsFor(technicianAId);
    const rowsB = ledgerRowsFor(technicianBId);
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    const amountA = rowsA[0]?.amount ?? 0;
    const amountB = rowsB[0]?.amount ?? 0;
    expect(amountA).toBe(-30000);
    expect(amountB).toBe(-20000);
    expect(amountA + amountB).toBe(-50000);
  });

  it('validation (all rejected before any write): the same technician listed twice', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    const claimId = await deliverAndGetClaimId(jobId);

    await expect(
      decisionRepo.approveClaim({
        claimId,
        recipients: [
          { technicianPartyId: technicianAId, amountPaisa: 30000, outsideHistoryReason: null },
          { technicianPartyId: technicianAId, amountPaisa: 20000, outsideHistoryReason: null },
        ],
        decidedAt: '2026-09-25',
      }),
    ).rejects.toThrow(/listed more than once/);

    expect(ledgerRowsFor(technicianAId)).toHaveLength(0);
    const decisions = rawDb
      .prepare(`SELECT id FROM commission_decision WHERE claim_id = ?`)
      .all(claimId);
    expect(decisions).toHaveLength(0);
  });

  it('validation: a recipient amountPaisa <= 0 is rejected before any write', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    const claimId = await deliverAndGetClaimId(jobId);

    await expect(
      decisionRepo.approveClaim({
        claimId,
        recipients: [
          { technicianPartyId: technicianAId, amountPaisa: 0, outsideHistoryReason: null },
        ],
        decidedAt: '2026-09-25',
      }),
    ).rejects.toThrow(/amount must be > 0/);
    expect(ledgerRowsFor(technicianAId)).toHaveLength(0);
  });

  it('OD-16-12: a recipient not in the job history, with no outsideHistoryReason -> rejected before any write', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    const claimId = await deliverAndGetClaimId(jobId);

    await expect(
      decisionRepo.approveClaim({
        claimId,
        recipients: [
          { technicianPartyId: outsideStaffId, amountPaisa: 50000, outsideHistoryReason: null },
        ],
        decidedAt: '2026-09-25',
      }),
    ).rejects.toThrow(/outsideHistoryReason/);
    expect(ledgerRowsFor(outsideStaffId)).toHaveLength(0);
  });

  it('OD-16-12: a recipient not in the job history, WITH a non-blank reason -> accepted, reason stored on the recipient row', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    const claimId = await deliverAndGetClaimId(jobId);

    const decision = await decisionRepo.approveClaim({
      claimId,
      recipients: [
        {
          technicianPartyId: outsideStaffId,
          amountPaisa: 50000,
          outsideHistoryReason: 'Senior technician covered for A on this job',
        },
      ],
      decidedAt: '2026-09-25',
    });

    expect(decision.recipients[0]).toMatchObject({
      technicianPartyId: outsideStaffId,
      amountPaisa: 50000,
      outsideHistoryReason: 'Senior technician covered for A on this job',
    });
    expect(ledgerRowsFor(outsideStaffId)).toHaveLength(1);
  });

  it('OD-16-12: a non-staff party as recipient is rejected outright, even with a reason', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    const claimId = await deliverAndGetClaimId(jobId);

    await expect(
      decisionRepo.approveClaim({
        claimId,
        recipients: [
          {
            technicianPartyId: customerId,
            amountPaisa: 50000,
            outsideHistoryReason: 'trusted friend',
          },
        ],
        decidedAt: '2026-09-25',
      }),
    ).rejects.toThrow(/must be an active staff party/);
  });

  it('approving an already-decided (not reversed) claim is rejected', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    const claimId = await deliverAndGetClaimId(jobId);

    await decisionRepo.approveClaim({
      claimId,
      recipients: [
        { technicianPartyId: technicianAId, amountPaisa: 50000, outsideHistoryReason: null },
      ],
      decidedAt: '2026-09-25',
    });

    await expect(
      decisionRepo.approveClaim({
        claimId,
        recipients: [
          { technicianPartyId: technicianAId, amountPaisa: 50000, outsideHistoryReason: null },
        ],
        decidedAt: '2026-09-26',
      }),
    ).rejects.toThrow(/already has an active decision/);
  });
});

describe('KyselyCommissionDecisionRepository.rejectClaim', () => {
  it('rejects a claim with a reason — one commission_decision row (attemptNo=1), no ledger rows', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    const claimId = await deliverAndGetClaimId(jobId);

    const decision = await decisionRepo.rejectClaim({
      claimId,
      reason: 'Suggested amount looks wrong for this job',
      decidedAt: '2026-09-25',
    });

    expect(decision.decision).toBe('rejected');
    expect(decision.attemptNo).toBe(1);
    expect(ledgerRowsFor(technicianAId)).toHaveLength(0);
  });

  it('a blank (whitespace-only) reject reason is rejected — trimmed length must be > 0', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    const claimId = await deliverAndGetClaimId(jobId);

    await expect(
      decisionRepo.rejectClaim({ claimId, reason: '   ', decidedAt: '2026-09-25' }),
    ).rejects.toThrow(/reject reason/);
    const decisions = rawDb
      .prepare(`SELECT id FROM commission_decision WHERE claim_id = ?`)
      .all(claimId);
    expect(decisions).toHaveLength(0);
  });
});

describe('KyselyCommissionDecisionRepository.reverseDecision — GAP-1 correction path (OD-16-3a)', () => {
  it('reversing an approved decision writes a reversal row and one reversing party_ledger row per recipient; the source claim becomes pending again', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    const claimId = await deliverAndGetClaimId(jobId);

    const decision = await decisionRepo.approveClaim({
      claimId,
      recipients: [
        { technicianPartyId: technicianAId, amountPaisa: 50000, outsideHistoryReason: null },
      ],
      decidedAt: '2026-09-25',
    });

    await decisionRepo.reverseDecision({
      decisionId: decision.id,
      reason: 'Wrong technician selected',
      reversedAt: '2026-09-26',
    });

    const rows = ledgerRowsFor(technicianAId);
    expect(rows).toHaveLength(2);
    const sum = rows.reduce((acc, r) => acc + r.amount, 0);
    // Net for this decision's source is 0 — the -50000 approval plus the +50000 reversal.
    expect(sum).toBe(0);
    expect(rows[1]).toMatchObject({
      amount: 50000,
      entry_type: 'commission',
      source_type: 'commission_decision',
      source_id: decision.id,
      entry_date: '2026-09-26',
    });

    const pending = await decisionRepo.listPendingClaims();
    expect(pending.some((c) => c.claimId === claimId)).toBe(true);
  });

  it('re-approving the same (now-pending) claim for 50000 to a DIFFERENT technician -> attemptNo=2, new technician paid -50000, original technician nets 0 across both decisions', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    assignTechnician(jobId, technicianBId, '2026-09-24T09:00:00.000Z');
    const claimId = await deliverAndGetClaimId(jobId);

    const first = await decisionRepo.approveClaim({
      claimId,
      recipients: [
        { technicianPartyId: technicianAId, amountPaisa: 50000, outsideHistoryReason: null },
      ],
      decidedAt: '2026-09-25',
    });
    await decisionRepo.reverseDecision({
      decisionId: first.id,
      reason: 'Wrong technician',
      reversedAt: '2026-09-26',
    });

    const second = await decisionRepo.approveClaim({
      claimId,
      recipients: [
        { technicianPartyId: technicianBId, amountPaisa: 50000, outsideHistoryReason: null },
      ],
      decidedAt: '2026-09-26',
    });

    expect(second.attemptNo).toBe(2);
    const rowsA = ledgerRowsFor(technicianAId);
    const rowsB = ledgerRowsFor(technicianBId);
    expect(rowsA.reduce((acc, r) => acc + r.amount, 0)).toBe(0);
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0]?.amount).toBe(-50000);
  });

  it('reversing the same decision a second time is rejected — UNIQUE(decision_id) is the DB backstop, no second reversal row is created', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    const claimId = await deliverAndGetClaimId(jobId);
    const decision = await decisionRepo.approveClaim({
      claimId,
      recipients: [
        { technicianPartyId: technicianAId, amountPaisa: 50000, outsideHistoryReason: null },
      ],
      decidedAt: '2026-09-25',
    });
    await decisionRepo.reverseDecision({
      decisionId: decision.id,
      reason: 'First reversal',
      reversedAt: '2026-09-26',
    });

    await expect(
      decisionRepo.reverseDecision({
        decisionId: decision.id,
        reason: 'Second attempt',
        reversedAt: '2026-09-27',
      }),
    ).rejects.toThrow(/already been reversed/);

    const reversals = rawDb
      .prepare(`SELECT id FROM commission_decision_reversal WHERE decision_id = ?`)
      .all(decision.id);
    expect(reversals).toHaveLength(1);
  });

  it('reversing a REJECTED decision writes only the reversal row, zero party_ledger rows, and the claim becomes pending again', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    const claimId = await deliverAndGetClaimId(jobId);

    const decision = await decisionRepo.rejectClaim({
      claimId,
      reason: 'Not a real commission case',
      decidedAt: '2026-09-25',
    });

    await decisionRepo.reverseDecision({
      decisionId: decision.id,
      reason: 'Reconsidered — should be approved instead',
      reversedAt: '2026-09-26',
    });

    const ledgerRows = rawDb
      .prepare(
        `SELECT id FROM party_ledger WHERE source_type = 'commission_decision' AND source_id = ?`,
      )
      .all(decision.id);
    expect(ledgerRows).toHaveLength(0);

    const pending = await decisionRepo.listPendingClaims();
    expect(pending.some((c) => c.claimId === claimId)).toBe(true);
  });

  it('multi-recipient reversal: reversing an approval to two recipients writes two reversing party_ledger rows, one per original recipient', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    assignTechnician(jobId, technicianBId, '2026-09-24T09:00:00.000Z');
    const claimId = await deliverAndGetClaimId(jobId);

    const decision = await decisionRepo.approveClaim({
      claimId,
      recipients: [
        { technicianPartyId: technicianAId, amountPaisa: 30000, outsideHistoryReason: null },
        { technicianPartyId: technicianBId, amountPaisa: 20000, outsideHistoryReason: null },
      ],
      decidedAt: '2026-09-25',
    });

    await decisionRepo.reverseDecision({
      decisionId: decision.id,
      reason: 'Wrong split',
      reversedAt: '2026-09-26',
    });

    const rowsA = ledgerRowsFor(technicianAId);
    const rowsB = ledgerRowsFor(technicianBId);
    expect(rowsA).toHaveLength(2);
    expect(rowsB).toHaveLength(2);
    expect(rowsA.reduce((acc, r) => acc + r.amount, 0)).toBe(0);
    expect(rowsB.reduce((acc, r) => acc + r.amount, 0)).toBe(0);
  });

  it('a blank reversal reason is rejected — trimmed length must be > 0', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    const claimId = await deliverAndGetClaimId(jobId);
    const decision = await decisionRepo.approveClaim({
      claimId,
      recipients: [
        { technicianPartyId: technicianAId, amountPaisa: 50000, outsideHistoryReason: null },
      ],
      decidedAt: '2026-09-25',
    });

    await expect(
      decisionRepo.reverseDecision({
        decisionId: decision.id,
        reason: '  ',
        reversedAt: '2026-09-26',
      }),
    ).rejects.toThrow(/reversal reason/);
  });
});

describe('KyselyCommissionDecisionRepository.listPendingClaims / getClaimDetail', () => {
  it('a freshly-delivered claim with no decision is pending; approving it removes it from the pending list', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    const claimId = await deliverAndGetClaimId(jobId);

    const pendingBefore = await decisionRepo.listPendingClaims();
    expect(pendingBefore.some((c) => c.claimId === claimId)).toBe(true);

    await decisionRepo.approveClaim({
      claimId,
      recipients: [
        { technicianPartyId: technicianAId, amountPaisa: 50000, outsideHistoryReason: null },
      ],
      decidedAt: '2026-09-25',
    });

    const pendingAfter = await decisionRepo.listPendingClaims();
    expect(pendingAfter.some((c) => c.claimId === claimId)).toBe(false);
  });

  it('getClaimDetail returns full technician history (including removed) and the full decision/reversal trail', async () => {
    const jobId = insertJob();
    assignTechnician(jobId, technicianAId, '2026-09-24T08:00:00.000Z');
    rawDb
      .prepare(`UPDATE job_technician SET unassigned_at = ? WHERE job_id = ? AND party_id = ?`)
      .run('2026-09-24T09:00:00.000Z', jobId, technicianAId);
    assignTechnician(jobId, technicianBId, '2026-09-24T09:30:00.000Z');
    const claimId = await deliverAndGetClaimId(jobId);

    const decision = await decisionRepo.approveClaim({
      claimId,
      recipients: [
        { technicianPartyId: technicianBId, amountPaisa: 50000, outsideHistoryReason: null },
      ],
      decidedAt: '2026-09-25',
    });
    await decisionRepo.reverseDecision({
      decisionId: decision.id,
      reason: 'Testing detail readback',
      reversedAt: '2026-09-26',
    });

    const detail = await decisionRepo.getClaimDetail(claimId);
    expect(detail.technicianHistory).toHaveLength(2);
    expect(
      detail.technicianHistory.find((t) => t.technicianPartyId === technicianAId)?.unassignedAt,
    ).not.toBeNull();
    expect(
      detail.technicianHistory.find((t) => t.technicianPartyId === technicianBId)?.unassignedAt,
    ).toBeNull();

    expect(detail.decisions).toHaveLength(1);
    expect(detail.decisions[0]?.reversal).toMatchObject({ reason: 'Testing detail readback' });
  });

  it('getClaimDetail on an unknown claim id throws', async () => {
    await expect(decisionRepo.getClaimDetail('does-not-exist')).rejects.toThrow(/not found/);
  });
});
