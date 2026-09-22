/**
 * P16-1/OD-16-7 dev-only service charge seed — test data for exercising
 * the delivery modal and (once built) commission claims without adding
 * charges by hand.
 *
 * NOT part of the shipped app. Never imported by apps/server or any
 * package — this only runs when invoked directly, and only against a
 * database file named explicitly on the command line. Same pattern as
 * scripts/seed-test-data.ts: open via the real openDatabase(), write
 * through the actual core service + Kysely repository (createServiceCharge
 * / KyselyServiceChargeRepository), never raw INSERTs — so name
 * uniqueness and commission-mode validation run exactly as they would
 * for a real Settings-screen create.
 *
 * Usage:
 *   npx tsx scripts/seed-service-charges.ts <path-to-db-file>
 *
 * Refuses to run if:
 *   - no db path is given,
 *   - the target database's `service_charge` table is not empty (never
 *     overwrites existing data), or
 *   - the target database is a packaged production database — there is
 *     no reliable way for a standalone script to detect that from a bare
 *     file path, so this is enforced by convention (only ever invoke
 *     this against ./data/shop-dev.db or a throwaway test copy) — never
 *     wired into any npm script or the app's own startup path, unlike
 *     packages/db/src/bootstrap.ts's brand starter-list seed (OD-16-7),
 *     which IS safe to run every startup because it is idempotent and
 *     tenant-scoped, not because it detects production.
 */
import { createServiceCharge } from '@shop/core';
import { createKyselyDb, KyselyServiceChargeRepository, openDatabase } from '@shop/db';

interface SeedCharge {
  readonly name: string;
  readonly jobType: string | null;
  readonly retailRupees: number;
  readonly commissionMode: 'none' | 'fixed' | 'bp';
  readonly commissionAmountRupees?: number;
  readonly commissionPercent?: number;
}

// OD-16-7 minimum set. Obviously-test prices.
const SEED_CHARGES: readonly SeedCharge[] = [
  {
    name: 'AC Installation',
    jobType: 'installation',
    retailRupees: 3000,
    commissionMode: 'fixed',
    commissionAmountRupees: 500,
  },
  { name: 'AC General Service', jobType: 'in_shop', retailRupees: 800, commissionMode: 'none' },
  { name: 'AC Gas Refill', jobType: 'in_shop', retailRupees: 2500, commissionMode: 'none' },
  {
    name: 'Fridge Gas Charging',
    jobType: 'in_shop',
    retailRupees: 2200,
    commissionMode: 'none',
  },
  {
    name: 'Compressor Replacement Labour',
    jobType: 'in_shop',
    retailRupees: 4000,
    commissionMode: 'bp',
    commissionPercent: 10,
  },
  { name: 'Oven Repair', jobType: 'in_shop', retailRupees: 1000, commissionMode: 'none' },
  {
    name: 'Checking / Inspection Fee',
    jobType: null,
    retailRupees: 300,
    commissionMode: 'none',
  },
];

async function main(): Promise<void> {
  const dbPath = process.argv[2];
  if (!dbPath) {
    console.error('Usage: npx tsx scripts/seed-service-charges.ts <path-to-db-file>');
    process.exit(1);
  }

  const tenantId = process.env['TENANT_ID'] ?? '00000000-0000-0000-0000-000000000001';
  const rawDb = openDatabase(dbPath);

  try {
    const chargeCount = rawDb.prepare(`SELECT COUNT(*) AS count FROM service_charge`).get() as {
      count: number;
    };
    if (chargeCount.count > 0) {
      console.error(
        `Refusing to seed: '${dbPath}' already has ${String(chargeCount.count)} service_charge row(s). ` +
          `This script only runs against a fresh/empty database — it never overwrites existing data.`,
      );
      process.exit(1);
    }

    const repo = new KyselyServiceChargeRepository(createKyselyDb(rawDb), tenantId);

    for (const charge of SEED_CHARGES) {
      await createServiceCharge(repo, {
        name: charge.name,
        jobType: charge.jobType,
        retailChargePaisa: Math.round(charge.retailRupees * 100),
        wholesaleChargePaisa: null,
        typicalMinutes: null,
        notes: null,
        commissionMode: charge.commissionMode,
        commissionAmountPaisa:
          charge.commissionAmountRupees === undefined
            ? null
            : Math.round(charge.commissionAmountRupees * 100),
        commissionBp:
          charge.commissionPercent === undefined
            ? null
            : Math.round(charge.commissionPercent * 100),
      });
      console.warn(`Seeded: ${charge.name}`);
    }

    console.warn(`Done — ${String(SEED_CHARGES.length)} service charges seeded into '${dbPath}'.`);
  } finally {
    rawDb.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
