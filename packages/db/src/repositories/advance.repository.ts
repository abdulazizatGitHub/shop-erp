import type { Kysely } from 'kysely';
import { formatDisplayDocNumber, Money, newId } from '@shop/shared';
import type {
  AdvanceRecord,
  AdvanceRepositoryPort,
  ListAdvancesRepoInput,
  RecordAdvanceRepoInput,
} from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

// document_sequence: 'payment_out'/PMT. Confirmed by grep (0006's data
// migration only backfills this for tenants that already had a
// 'payment_in' row at migration time — on a fresh DB it inserts zero
// rows for either doc_type) that this must be lazily created on first
// use, the same insert-if-missing pattern payment.repository.ts already
// uses for 'payment_in'/RCP and party.repository.ts uses for 'staff'/STF.
const ADVANCE_DOC_TYPE = 'payment_out';
const ADVANCE_DOC_PREFIX = 'PMT';
const ADVANCE_PAYMENT_DIRECTION = 'out';
const ADVANCE_PAYMENT_METHOD = 'cash';
// PHASE_7.md §5 GAP-4's approved decision text. NOTE: the live schema's
// own entry_type comment (0001_init.sql) lists 'staff_advance', not
// 'advance' — no CHECK constraint enforces either value (confirmed by
// grep — zero CHECK constraints in this schema), so nothing breaks, but
// this is a real discrepancy between the schema author's documented
// intent and this phase's approved decision. Flagged in PROJECT.md;
// using 'advance' per the explicit, twice-repeated instruction.
const ADVANCE_LEDGER_ENTRY_TYPE = 'advance';

export class KyselyAdvanceRepository implements AdvanceRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  private async nextAdvanceDocNo(trx: Kysely<Database>): Promise<string> {
    const existing = await trx
      .selectFrom('documentSequence')
      .select('nextNumber')
      .where('tenantId', '=', this.tenantId)
      .where('docType', '=', ADVANCE_DOC_TYPE)
      .where('deviceCode', '=', this.deviceCode)
      .executeTakeFirst();

    const nextNumber = existing?.nextNumber ?? 1;

    if (existing) {
      await trx
        .updateTable('documentSequence')
        .set({ nextNumber: nextNumber + 1 })
        .where('tenantId', '=', this.tenantId)
        .where('docType', '=', ADVANCE_DOC_TYPE)
        .where('deviceCode', '=', this.deviceCode)
        .execute();
    } else {
      await trx
        .insertInto('documentSequence')
        .values({
          tenantId: this.tenantId,
          docType: ADVANCE_DOC_TYPE,
          prefix: ADVANCE_DOC_PREFIX,
          deviceCode: this.deviceCode,
          nextNumber: 2,
        })
        .execute();
    }

    return formatDisplayDocNumber(ADVANCE_DOC_PREFIX, nextNumber);
  }

  /**
   * ONE TRANSACTION: payment (direction='out', the source of the
   * party_ledger row) inserted first so party_ledger.source_id can point
   * at it — same ordering payment.repository.ts's createPayment already
   * uses (payment row first, then the party_ledger row referencing its
   * id). amount is always positive on both rows (party_ledger.amount
   * signed +ve = staff owes the shop, PHASE_7.md §5 GAP-4).
   */
  async recordAdvance(input: RecordAdvanceRepoInput): Promise<AdvanceRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const docNo = await this.nextAdvanceDocNo(trx);
        const paymentId = newId();
        const ledgerId = newId();
        const now = new Date().toISOString();
        const amountPaisa = Money.of(input.amountPaisa);

        await trx
          .insertInto('payment')
          .values({
            id: paymentId,
            tenantId: this.tenantId,
            docNo,
            direction: ADVANCE_PAYMENT_DIRECTION,
            partyId: input.staffId,
            paymentDate: input.date,
            amount: amountPaisa,
            method: ADVANCE_PAYMENT_METHOD,
            referenceNo: null,
            notes: input.notes,
            createdAt: now,
            createdBy: null,
          })
          .execute();

        await trx
          .insertInto('partyLedger')
          .values({
            id: ledgerId,
            tenantId: this.tenantId,
            partyId: input.staffId,
            entryDate: input.date,
            entryType: ADVANCE_LEDGER_ENTRY_TYPE,
            amount: amountPaisa,
            runningNote: null,
            sourceType: 'advance',
            sourceId: paymentId,
            reversedById: null,
            createdAt: now,
            createdBy: null,
            billReference: null,
            dueDate: null,
            billNotes: null,
          })
          .execute();

        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'party_ledger',
            recordId: ledgerId,
            action: 'insert',
            changedFields: null,
            oldValues: null,
            userId: null,
            deviceCode: this.deviceCode,
            createdAt: now,
          })
          .execute();

        await trx
          .insertInto('syncOutbox')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'party_ledger',
            recordId: ledgerId,
            operation: 'insert',
            payload: null,
            createdAt: now,
            syncedAt: null,
            syncAttempts: 0,
            lastError: null,
          })
          .execute();

        const staff = await trx
          .selectFrom('party')
          .select('name')
          .where('id', '=', input.staffId)
          .executeTakeFirst();

        return {
          id: ledgerId,
          staffId: input.staffId,
          staffName: staff?.name ?? '',
          date: input.date,
          amountPaisa,
          docNo,
          notes: input.notes,
        };
      }),
    );
  }

  /**
   * entry_type='advance' rows for one staff member, filtered to one
   * calendar month via a 'YYYY-MM-' LIKE prefix on entry_date (same
   * simplification attendance.repository.ts's getMonthAttendance uses
   * for its own plain-ISO-date TEXT column, rather than a raw
   * strftime() SQL fragment). docNo comes from the linked payment row
   * via source_id (set to the payment's id in recordAdvance above).
   */
  async listAdvances(input: ListAdvancesRepoInput): Promise<readonly AdvanceRecord[]> {
    const monthPrefix = `${String(input.year).padStart(4, '0')}-${String(input.month).padStart(2, '0')}-`;

    const rows = await this.db
      .selectFrom('partyLedger')
      .innerJoin('payment', 'payment.id', 'partyLedger.sourceId')
      .innerJoin('party', 'party.id', 'partyLedger.partyId')
      .select([
        'partyLedger.id',
        'partyLedger.partyId as staffId',
        'party.name as staffName',
        'partyLedger.entryDate as date',
        'partyLedger.amount as amountPaisa',
        'payment.docNo as docNo',
        'payment.notes as notes',
      ])
      .where('partyLedger.tenantId', '=', this.tenantId)
      .where('partyLedger.partyId', '=', input.staffId)
      .where('partyLedger.entryType', '=', ADVANCE_LEDGER_ENTRY_TYPE)
      .where('partyLedger.entryDate', 'like', `${monthPrefix}%`)
      .orderBy('partyLedger.entryDate')
      .execute();

    return rows.map((row): AdvanceRecord => ({
      id: row.id,
      staffId: row.staffId,
      staffName: row.staffName,
      date: row.date,
      amountPaisa: row.amountPaisa,
      docNo: row.docNo,
      notes: row.notes,
    }));
  }
}
