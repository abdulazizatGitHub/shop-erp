import type { Kysely } from 'kysely';
import { formatDisplayDocNumber, Money, newId } from '@shop/shared';
import { type NewPaymentInput, type PaymentRecord, type PaymentRepositoryPort } from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

// Renamed by migration 0006 (ADR-0012): every payment row created before
// or after this rename has direction='in' — no payment-out code path
// exists yet (PROJECT.md, Phase 4/8). doc_type in document_sequence must
// match what 0006 actually wrote: 'payment' -> 'payment_in'.
const PAYMENT_CODE_DOC_TYPE = 'payment_in';
const PAYMENT_CODE_PREFIX = 'RCP';
const PAYMENT_DIRECTION_IN = 'in';
const LEDGER_ENTRY_TYPE = 'payment_received';

export class KyselyPaymentRepository implements PaymentRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  private async nextPaymentDocNo(trx: Kysely<Database>): Promise<string> {
    const existing = await trx
      .selectFrom('documentSequence')
      .select('nextNumber')
      .where('tenantId', '=', this.tenantId)
      .where('docType', '=', PAYMENT_CODE_DOC_TYPE)
      .where('deviceCode', '=', this.deviceCode)
      .executeTakeFirst();

    const nextNumber = existing?.nextNumber ?? 1;

    if (existing) {
      await trx
        .updateTable('documentSequence')
        .set({ nextNumber: nextNumber + 1 })
        .where('tenantId', '=', this.tenantId)
        .where('docType', '=', PAYMENT_CODE_DOC_TYPE)
        .where('deviceCode', '=', this.deviceCode)
        .execute();
    } else {
      await trx
        .insertInto('documentSequence')
        .values({
          tenantId: this.tenantId,
          docType: PAYMENT_CODE_DOC_TYPE,
          prefix: PAYMENT_CODE_PREFIX,
          deviceCode: this.deviceCode,
          nextNumber: 2,
        })
        .execute();
    }

    return formatDisplayDocNumber(PAYMENT_CODE_PREFIX, nextNumber);
  }

  /**
   * No pre-check that `partyId` exists, and no call to
   * KyselyPartyRepository.getCustomerBalance(): (1) party_ledger.party_id
   * carries a NOT NULL foreign key to party(id), enforced by
   * `foreign_keys = ON` (packages/db/src/connection.ts) — an invalid
   * partyId already fails the INSERT itself with a constraint violation,
   * so a separate existence read would be redundant. (2)
   * getCustomerBalance() queries its own `this.db`; calling it from
   * inside this method's open `trx` (the same underlying connection)
   * risks a deadlock on Kysely's per-connection ConnectionMutex — the
   * same reasoning KyselySaleRepository.readCustomerBalancePaisa's
   * comment documents. No credit/balance check is required for a
   * payment either way — a customer may overpay.
   */
  async createPayment(input: NewPaymentInput): Promise<PaymentRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const docNo = await this.nextPaymentDocNo(trx);
        const id = newId();
        const now = new Date().toISOString();
        const amountPaisa = Money.of(input.amountPaisa);

        await trx
          .insertInto('payment')
          .values({
            id,
            tenantId: this.tenantId,
            docNo,
            direction: PAYMENT_DIRECTION_IN,
            partyId: input.partyId,
            paymentDate: input.paymentDate,
            amount: amountPaisa,
            method: input.method,
            referenceNo: input.referenceNo,
            notes: input.notes,
            createdAt: now,
            createdBy: null,
          })
          .execute();

        await trx
          .insertInto('partyLedger')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            partyId: input.partyId,
            entryDate: input.paymentDate,
            entryType: LEDGER_ENTRY_TYPE,
            amount: Money.negate(amountPaisa),
            runningNote: null,
            sourceType: 'payment',
            sourceId: id,
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
            tableName: 'payment',
            recordId: id,
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
            tableName: 'payment',
            recordId: id,
            operation: 'insert',
            payload: null,
            createdAt: now,
            syncedAt: null,
            syncAttempts: 0,
            lastError: null,
          })
          .execute();

        return {
          id,
          docNo,
          partyId: input.partyId,
          amountPaisa,
          direction: PAYMENT_DIRECTION_IN,
          method: input.method,
          paymentDate: input.paymentDate,
        };
      }),
    );
  }
}
