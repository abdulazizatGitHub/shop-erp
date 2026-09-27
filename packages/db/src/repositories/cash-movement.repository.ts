import { sql, type Kysely } from 'kysely';
import { formatDisplayDocNumber, newId } from '@shop/shared';
import {
  assertCashMovementValid,
  assertNoteNotBlank,
  assertReversalValid,
  CashMovementAlreadyReversedError,
  CashSessionNotOpenError,
  MultipleOpenSessionsError,
  type CashMovementRecord,
  type CashMovementRepositoryPort,
  type NewCashMovementInput,
  type ReverseCashMovementRepoInput,
} from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

const CASH_MOVEMENT_DOC_TYPE = 'cash_movement';
const CASH_MOVEMENT_DOC_PREFIX = 'CM';

const CASH_MOVEMENT_COLUMNS = [
  'id',
  'docNo',
  'movementDate',
  'movementType',
  'amount',
  'note',
  'reversesId',
  'createdAt',
] as const;

/**
 * Phase 17.5 (docs/phases/PHASE_17_5.md), ADR-0016. Deliberately
 * queries `cashSession` directly rather than composing
 * `KyselyCashSessionRepository` — no repository in this codebase
 * injects another; each operates on `this.db` alone (confirmed by
 * reading every existing repository's constructor before writing this
 * one).
 */
export class KyselyCashMovementRepository implements CashMovementRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  /**
   * Resolves the single currently-open session's `sessionDate`, or
   * throws — CashSessionNotOpenError if none is open,
   * MultipleOpenSessionsError if more than one is (should be
   * unreachable once `openSession`'s own guard is in place — review
   * round 4 R8 — kept as a defensive backstop here too).
   */
  private async requireOpenSessionDate(trx: Kysely<Database>): Promise<string> {
    const rows = await trx
      .selectFrom('cashSession')
      .select(['sessionDate'])
      .where('tenantId', '=', this.tenantId)
      .where('closedAt', 'is', null)
      .execute();

    if (rows.length > 1) {
      throw new MultipleOpenSessionsError(rows.map((r) => r.sessionDate));
    }
    const row = rows[0];
    if (!row) {
      throw new CashSessionNotOpenError();
    }
    return row.sessionDate;
  }

  private async nextDocNo(trx: Kysely<Database>): Promise<string> {
    const existing = await trx
      .selectFrom('documentSequence')
      .select('nextNumber')
      .where('tenantId', '=', this.tenantId)
      .where('docType', '=', CASH_MOVEMENT_DOC_TYPE)
      .where('deviceCode', '=', this.deviceCode)
      .executeTakeFirst();

    const nextNumber = existing?.nextNumber ?? 1;

    if (existing) {
      await trx
        .updateTable('documentSequence')
        .set({ nextNumber: nextNumber + 1 })
        .where('tenantId', '=', this.tenantId)
        .where('docType', '=', CASH_MOVEMENT_DOC_TYPE)
        .where('deviceCode', '=', this.deviceCode)
        .execute();
    } else {
      await trx
        .insertInto('documentSequence')
        .values({
          tenantId: this.tenantId,
          docType: CASH_MOVEMENT_DOC_TYPE,
          prefix: CASH_MOVEMENT_DOC_PREFIX,
          deviceCode: this.deviceCode,
          nextNumber: 2,
        })
        .execute();
    }

    return formatDisplayDocNumber(CASH_MOVEMENT_DOC_PREFIX, nextNumber);
  }

  private async insertMovementRow(
    trx: Kysely<Database>,
    values: {
      movementDate: string;
      movementType: string;
      amount: number;
      note: string;
      reversesId: string | null;
    },
  ): Promise<CashMovementRecord> {
    const id = newId();
    const now = new Date().toISOString();
    const docNo = await this.nextDocNo(trx);

    await trx
      .insertInto('cashMovement')
      .values({
        id,
        tenantId: this.tenantId,
        docNo,
        movementDate: values.movementDate,
        movementType: values.movementType,
        amount: values.amount,
        note: values.note,
        reversesId: values.reversesId,
        createdAt: now,
        createdBy: null,
      })
      .execute();

    await trx
      .insertInto('auditLog')
      .values({
        id: newId(),
        tenantId: this.tenantId,
        tableName: 'cash_movement',
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
        tableName: 'cash_movement',
        recordId: id,
        operation: 'insert',
        payload: null,
        createdAt: now,
        syncedAt: null,
        syncAttempts: 0,
        lastError: null,
      })
      .execute();

    const row = await trx
      .selectFrom('cashMovement')
      .select(CASH_MOVEMENT_COLUMNS)
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    return toCashMovementRecord(row);
  }

  async recordMovement(input: NewCashMovementInput): Promise<CashMovementRecord> {
    assertCashMovementValid(input.movementType, input.amountPaisa, input.note);

    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const movementDate = await this.requireOpenSessionDate(trx);
        return this.insertMovementRow(trx, {
          movementDate,
          movementType: input.movementType,
          amount: input.amountPaisa,
          note: input.note,
          reversesId: null,
        });
      }),
    );
  }

  async reverseMovement(input: ReverseCashMovementRepoInput): Promise<CashMovementRecord> {
    assertNoteNotBlank(input.note);

    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const original = await trx
          .selectFrom('cashMovement')
          .select(CASH_MOVEMENT_COLUMNS)
          .where('id', '=', input.originalId)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!original) {
          throw new Error(`Cash movement ${input.originalId} not found`);
        }
        const originalRecord = toCashMovementRecord(original);

        // Pre-check before the insert — a plain message, no DB round
        // trip for a doomed insert. UNIQUE(reverses_id) stays as the
        // backstop for the check-then-insert race window (review round
        // 3 R7).
        const existingReversal = await trx
          .selectFrom('cashMovement')
          .select(['id'])
          .where('reversesId', '=', input.originalId)
          .executeTakeFirst();
        if (existingReversal) {
          throw new CashMovementAlreadyReversedError(input.originalId);
        }

        const openSessionDate = await this.requireOpenSessionDate(trx).catch((error: unknown) => {
          // A missing/ambiguous open session is still a valid state to
          // report through assertReversalValid's own
          // CashMovementSessionClosedError message (review round 3 R7)
          // rather than a raw CashSessionNotOpenError/MultipleOpenSessionsError
          // here — null represents "no session is open" to that check.
          if (error instanceof CashSessionNotOpenError) return null;
          throw error;
        });

        const reversalAmountPaisa = -originalRecord.amountPaisa;
        assertReversalValid(originalRecord, reversalAmountPaisa, openSessionDate);

        return this.insertMovementRow(trx, {
          movementDate: originalRecord.movementDate,
          movementType: originalRecord.movementType,
          amount: reversalAmountPaisa,
          note: input.note,
          reversesId: input.originalId,
        });
      }),
    );
  }

  async listForDateRange(dateFrom: string, dateTo: string): Promise<readonly CashMovementRecord[]> {
    const rows = await this.db
      .selectFrom('cashMovement')
      .select(CASH_MOVEMENT_COLUMNS)
      .where('tenantId', '=', this.tenantId)
      .where('movementDate', '>=', dateFrom)
      .where('movementDate', '<=', dateTo)
      .orderBy('movementDate')
      .orderBy('createdAt')
      .execute();

    return rows.map(toCashMovementRecord);
  }
}

function toCashMovementRecord(row: {
  id: string;
  docNo: string;
  movementDate: string;
  movementType: string;
  amount: number;
  note: string;
  reversesId: string | null;
  createdAt: string;
}): CashMovementRecord {
  return {
    id: row.id,
    docNo: row.docNo,
    movementDate: row.movementDate,
    movementType: row.movementType as CashMovementRecord['movementType'],
    amountPaisa: row.amount,
    note: row.note,
    reversesId: row.reversesId,
    createdAt: row.createdAt,
  };
}

/** Re-exported so callers computing `cashMovementsNet` for closeSession don't need their own SQL — kept here since it's this table's own concern. */
export async function sumCashMovementsForDate(
  trx: Kysely<Database>,
  tenantId: string,
  date: string,
): Promise<number> {
  const result = await sql<{ total: number }>`
    SELECT COALESCE(SUM(amount), 0) AS total FROM cash_movement
    WHERE tenant_id = ${tenantId} AND movement_date = ${date}
  `.execute(trx);
  return result.rows[0]?.total ?? 0;
}
