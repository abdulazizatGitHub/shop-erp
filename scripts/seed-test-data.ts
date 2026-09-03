/**
 * P5 hardware-testing seed — realistic demo data for exercising every
 * screen/report on a packaged install without entering data by hand.
 *
 * NOT part of the shipped app. Never imported by apps/server or any
 * package — this only runs when invoked directly, and only against a
 * database file named explicitly on the command line. Shape follows the
 * Phase 4 precedent (`seed-phase4-verify.ts`, PROGRESS.md Session 13):
 * open the DB via the real `openDatabase()`, write through the actual
 * Kysely repository classes — never raw INSERTs — so doc numbering,
 * stock movements, and party_ledger posting all go through the same
 * business logic a real transaction uses. Unlike that script, this one
 * is committed and reusable rather than run-once-and-deleted.
 *
 * Usage:
 *   npx tsx scripts/seed-test-data.ts <path-to-db-file>
 *
 * Refuses to run if:
 *   - no db path is given, or
 *   - the target database's `item` table is not empty (never overwrites
 *     existing data — real or otherwise).
 */
import {
  createKyselyDb,
  KyselyImportRepository,
  KyselyItemRepository,
  KyselyPartyRepository,
  KyselyPaymentRepository,
  KyselyPurchaseRepository,
  KyselySaleRepository,
  openDatabase,
} from '@shop/db';
import { Qty } from '@shop/shared';

// Same defaults as apps/server/src/main.ts's resolveTenantId/resolveDeviceCode
// — this script must agree with the app on which tenant it's seeding.
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_DEVICE_CODE = 'A';

function resolveTenantId(): string {
  return process.env['TENANT_ID'] ?? DEFAULT_TENANT_ID;
}

function resolveDeviceCode(): string {
  return process.env['DEVICE_CODE'] ?? DEFAULT_DEVICE_CODE;
}

async function main(): Promise<void> {
  const dbPath = process.argv[2];
  if (!dbPath) {
    console.error('Usage: npx tsx scripts/seed-test-data.ts <path-to-db-file>');
    process.exit(1);
  }

  const tenantId = resolveTenantId();
  const deviceCode = resolveDeviceCode();
  const rawDb = openDatabase(dbPath);

  try {
    const itemCount = rawDb.prepare(`SELECT COUNT(*) AS count FROM item`).get() as {
      count: number;
    };
    if (itemCount.count > 0) {
      console.error(
        `Refusing to seed: '${dbPath}' already has ${String(itemCount.count)} item row(s). ` +
          `This script only runs against a fresh/empty database — it never overwrites existing data.`,
      );
      process.exit(1);
    }

    const db = createKyselyDb(rawDb);

    const partyRepo = new KyselyPartyRepository(db, tenantId, deviceCode);
    const itemRepo = new KyselyItemRepository(db, tenantId, deviceCode);
    const purchaseRepo = new KyselyPurchaseRepository(db, tenantId, deviceCode);
    const saleRepo = new KyselySaleRepository(db, tenantId, deviceCode);
    const paymentRepo = new KyselyPaymentRepository(db, tenantId, deviceCode);
    const importRepo = new KyselyImportRepository(db, tenantId, deviceCode);

    // Reference data resolved by name — seeded by packages/db/src/bootstrap.ts's
    // seed(), which apps/server/src/main.ts already runs on every startup. A
    // copy of shop-dev.db has already been through that at least once.
    const partsUnit = await db
      .selectFrom('businessUnit')
      .select('id')
      .where('tenantId', '=', tenantId)
      .where('code', '=', 'PARTS')
      .executeTakeFirst();
    const repairUnit = await db
      .selectFrom('businessUnit')
      .select('id')
      .where('tenantId', '=', tenantId)
      .where('code', '=', 'REPAIR')
      .executeTakeFirst();
    if (!partsUnit || !repairUnit) {
      throw new Error(
        "PARTS/REPAIR business units not found — has bootstrap.ts's seed() run against " +
          'this database yet? Point this script at a copy of shop-dev.db, not an empty ' +
          'pre-migration file.',
      );
    }

    async function uomId(name: string): Promise<string> {
      const row = await db
        .selectFrom('uom')
        .select('id')
        .where('tenantId', '=', tenantId)
        .where('name', '=', name)
        .executeTakeFirst();
      if (!row) throw new Error(`UoM '${name}' not found — has bootstrap.ts's seed() run?`);
      return row.id;
    }
    const pieceUomId = await uomId('Piece');
    const footUomId = await uomId('Foot');
    const kgUomId = await uomId('Kg');

    const warehouse = await db
      .selectFrom('warehouse')
      .select('id')
      .where('tenantId', '=', tenantId)
      .where('isDefault', '=', 1)
      .executeTakeFirst();
    if (!warehouse) {
      throw new Error("Default warehouse not found — has bootstrap.ts's seed() run?");
    }
    const warehouseId = warehouse.id;

    const today = new Date().toISOString().slice(0, 10);

    // ---- Suppliers -----------------------------------------------------------
    const aliRefrigeration = await partyRepo.createSupplier({
      partyCode: null,
      name: 'Ali Refrigeration',
      shopName: null,
      phone: '0300-1234567',
      cityArea: null,
      paymentTerms: null,
      notes: 'P5 test data',
    });
    console.warn('Supplier created:', aliRefrigeration);

    const hamzaTraders = await partyRepo.createSupplier({
      partyCode: null,
      name: 'Hamza Traders',
      shopName: null,
      phone: '0311-9876543',
      cityArea: null,
      paymentTerms: null,
      notes: 'P5 test data',
    });
    console.warn('Supplier created:', hamzaTraders);

    // ---- Items -----------------------------------------------------------------
    // Retail prices in paisa (rupees x 100 — CLAUDE.md §3.1):
    //   Embraco Compressor 1/5 HP:  Rs 5,500 -> 550,000
    //   Copper Pipe 1/4" (per ft):  Rs   250 ->  25,000
    //   Gas Filling R-22 (per kg):  Rs 1,200 -> 120,000
    //   Thermostat Danfoss 077B:    Rs   900 ->  90,000
    //   Capacitor 25uF:             Rs   180 ->  18,000
    //   Labour Charge (AC Service): Rs 1,500 -> 150,000
    // Purchase prices are NOT stored at item-creation time — NewItemInput
    // has no purchase-price field; item.avg_cost/last_purchase_cost are
    // only ever set by an actual purchase transaction (createPurchase,
    // see CF-3 in PROJECT.md). Only Compressor and Capacitor get a real
    // purchase below, so only those two will carry a non-null avg_cost
    // after this script runs — that's correct app behaviour for an item
    // that has never been purchased, not a gap in this seed.
    const compressor = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Embraco Compressor 1/5 HP',
      nameUr: null,
      businessUnitId: partsUnit.id,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: 550_000,
    });
    console.warn('Item created:', compressor);

    const copperPipe = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Copper Pipe 1/4 inch (per foot)',
      nameUr: null,
      businessUnitId: partsUnit.id,
      stockUomId: footUomId,
      trackStock: true,
      retailPricePaisa: 25_000,
    });
    console.warn('Item created:', copperPipe);

    const gasFilling = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Gas Filling R-22 (per kg)',
      nameUr: null,
      businessUnitId: partsUnit.id,
      stockUomId: kgUomId,
      trackStock: false,
      retailPricePaisa: 120_000,
    });
    console.warn('Item created:', gasFilling);

    const thermostat = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Thermostat Danfoss 077B',
      nameUr: null,
      businessUnitId: partsUnit.id,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: 90_000,
    });
    console.warn('Item created:', thermostat);

    const capacitor = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Capacitor 25uF',
      nameUr: null,
      businessUnitId: partsUnit.id,
      stockUomId: pieceUomId,
      trackStock: true,
      retailPricePaisa: 18_000,
    });
    console.warn('Item created:', capacitor);

    // No physical unit applies to a service line — Piece is used as a
    // placeholder the same way non-stock items elsewhere in this schema
    // do; trackStock: false makes the unit itself immaterial.
    const labourCharge = await itemRepo.createItem({
      itemCode: null,
      nameEn: 'Labour Charge (AC Service)',
      nameUr: null,
      businessUnitId: repairUnit.id,
      stockUomId: pieceUomId,
      trackStock: false,
      retailPricePaisa: 150_000,
    });
    console.warn('Item created:', labourCharge);

    // ---- Opening stock (4 tracked items only) -----------------------------------
    // quantityMilli = Qty.fromUnits(units); unitCostPaisa matches each
    // item's stated purchase price above (rupees x 100):
    //   Compressor: 3 units  -> 3,000 milli,  cost 450,000 paisa (Rs 4,500)
    //   Copper Pipe: 50 feet -> 50,000 milli, cost  18,000 paisa (Rs   180)
    //   Thermostat: 5 units  -> 5,000 milli,  cost  65,000 paisa (Rs   650)
    //   Capacitor: 20 units  -> 20,000 milli, cost  12,000 paisa (Rs   120)
    await importRepo.insertOpeningStockMovements(
      [
        {
          itemId: compressor.id,
          quantityMilli: Qty.fromUnits(3),
          unitCostPaisa: 450_000,
          movementDate: today,
        },
        {
          itemId: copperPipe.id,
          quantityMilli: Qty.fromUnits(50),
          unitCostPaisa: 18_000,
          movementDate: today,
        },
        {
          itemId: thermostat.id,
          quantityMilli: Qty.fromUnits(5),
          unitCostPaisa: 65_000,
          movementDate: today,
        },
        {
          itemId: capacitor.id,
          quantityMilli: Qty.fromUnits(20),
          unitCostPaisa: 12_000,
          movementDate: today,
        },
      ],
      warehouseId,
    );
    console.warn('Opening stock posted for 4 tracked items.');

    // ---- Customer ----------------------------------------------------------------
    const ahmadElectronics = await partyRepo.createCustomer({
      partyCode: null,
      name: 'Ahmad Electronics',
      shopName: null,
      phone: '0333-5556789',
      customerType: 'retail',
      priceLevelId: null,
      creditLimitPaisa: null,
      notes: 'P5 test data',
    });
    console.warn('Customer created:', ahmadElectronics);

    // Opening udhaar balance: Rs 8,000 -> 800,000 paisa. Uses the real
    // KyselyImportRepository.insertCustomerOpeningBalances — this already
    // exists (packages/db/src/repositories/import.repository.ts) and is
    // the correct, idempotent way to post an opening party_ledger row.
    // There is no "no repository method exists" gap here, so this is not
    // a raw insert.
    await importRepo.insertCustomerOpeningBalances([
      {
        partyId: ahmadElectronics.id,
        entryDate: today,
        amountPaisa: 800_000,
        billReference: 'P5-SEED-OPENING',
        billNotes: 'P5 test data — opening udhaar balance',
      },
    ]);
    console.warn('Opening udhaar balance posted: Rs 8,000 for Ahmad Electronics.');

    // ---- Purchase from Ali Refrigeration --------------------------------------------
    //  2 x Compressor @ Rs 4,500 = Rs 9,000  ->  2 x 450,000 =   900,000 paisa
    // 10 x Capacitor  @ Rs   120 = Rs 1,200  -> 10 x  12,000 =   120,000 paisa
    // Total = 900,000 + 120,000 = 1,020,000 paisa = Rs 10,200
    // Cash purchase — the spec didn't request a supplier balance, so this
    // keeps Ali Refrigeration's own party_ledger at zero rather than
    // introducing an unrequested credit balance.
    const purchase = await purchaseRepo.createPurchase({
      supplierId: aliRefrigeration.id,
      warehouseId: null,
      purchaseDate: today,
      supplierInvoiceNo: null,
      paymentMode: 'cash',
      billReference: null,
      dueDate: null,
      billNotes: null,
      notes: 'P5 test data',
      lines: [
        {
          itemId: compressor.id,
          quantityMilli: Qty.fromUnits(2),
          unitCostPaisa: 450_000,
          notes: null,
        },
        {
          itemId: capacitor.id,
          quantityMilli: Qty.fromUnits(10),
          unitCostPaisa: 12_000,
          notes: null,
        },
      ],
    });
    console.warn('Purchase created:', purchase);
    if (purchase.totalAmountPaisa !== 1_020_000) {
      throw new Error(
        `Purchase total mismatch: expected 1,020,000 paisa, got ${String(purchase.totalAmountPaisa)}`,
      );
    }

    // ---- Sale 1: cash, walk-in --------------------------------------------------------
    // 1 x Thermostat Danfoss @ Rs 900 = Rs 900 -> 90,000 paisa, fully paid.
    const cashSale = await saleRepo.createSale({
      customerId: null,
      warehouseId: null,
      saleDate: today,
      paymentMode: 'cash',
      paidAmountPaisa: 90_000,
      notes: 'P5 test data',
      lines: [{ itemId: thermostat.id, quantityMilli: Qty.fromUnits(1), unitPricePaisa: 90_000 }],
    });
    console.warn('Cash sale created:', cashSale);
    if (cashSale.totalAmountPaisa !== 90_000) {
      throw new Error(
        `Cash sale total mismatch: expected 90,000 paisa, got ${String(cashSale.totalAmountPaisa)}`,
      );
    }

    // ---- Sale 2: udhaar, Ahmad Electronics --------------------------------------------
    // 2 x Capacitor 25uF @ Rs 180 = Rs 360 -> 36,000 paisa, paid 0 -> the
    // full amount posts to party_ledger (outstandingPaisa = total - paid,
    // see sale.repository.ts's createSale).
    const udhaarSale = await saleRepo.createSale({
      customerId: ahmadElectronics.id,
      warehouseId: null,
      saleDate: today,
      paymentMode: 'credit',
      paidAmountPaisa: 0,
      notes: 'P5 test data',
      lines: [{ itemId: capacitor.id, quantityMilli: Qty.fromUnits(2), unitPricePaisa: 18_000 }],
    });
    console.warn('Udhaar sale created:', udhaarSale);
    if (udhaarSale.totalAmountPaisa !== 36_000) {
      throw new Error(
        `Udhaar sale total mismatch: expected 36,000 paisa, got ${String(udhaarSale.totalAmountPaisa)}`,
      );
    }

    // ---- Payment received from Ahmad Electronics ----------------------------------------
    // Rs 3,000 cash -> 300,000 paisa, posts as a NEGATIVE party_ledger
    // entry (payment.repository.ts's createPayment: Money.negate).
    // Running balance for Ahmad Electronics:
    //   800,000 (opening) + 36,000 (udhaar sale) - 300,000 (this payment)
    //   = 536,000 paisa = Rs 5,360
    const payment = await paymentRepo.createPayment({
      partyId: ahmadElectronics.id,
      amountPaisa: 300_000,
      method: 'cash',
      paymentDate: today,
      referenceNo: null,
      notes: 'P5 test data',
    });
    console.warn('Payment created:', payment);

    const finalBalance = await partyRepo.getCustomerBalance(ahmadElectronics.id);
    console.warn('Ahmad Electronics final balance (paisa):', finalBalance.balancePaisa);
    if (finalBalance.balancePaisa !== 536_000) {
      throw new Error(
        `Balance mismatch: expected 536,000 paisa (Rs 5,360), got ${String(finalBalance.balancePaisa)}`,
      );
    }

    console.warn('\nSeed complete. Hand-calculated totals, verified by the script itself:');
    console.warn('  Purchase total:                  Rs 10,200 (1,020,000 paisa)');
    console.warn('  Cash sale total:                 Rs    900 (   90,000 paisa)');
    console.warn('  Udhaar sale total:                Rs   360 (   36,000 paisa)');
    console.warn('  Ahmad Electronics final balance:  Rs 5,360 (  536,000 paisa)');
  } finally {
    rawDb.close();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
