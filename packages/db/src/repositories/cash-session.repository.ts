import { sql, type Kysely } from 'kysely';
import { newId } from '@shop/shared';
import {
  SessionAlreadyOpenError,
  AnotherSessionStillOpenError,
  MultipleOpenSessionsError,
  type CashSessionRecord,
  type CashSessionRepositoryPort,
  type CloseSessionRepoInput,
  type OpenSessionRepoInput,
} from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';
import { sumCashMovementsForDate } from './cash-movement.repository.js';

const CASH_SESSION_COLUMNS = [
  'id',
  'sessionDate',
  'openedAt',
  'closedAt',
  'openingCash',
  'expectedCash',
  'countedCash',
  'difference',
] as const;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code.startsWith('SQLITE_CONSTRAINT')
  );
}

async function sumPaisa(
  trx: Kysely<Database>,
  query: ReturnType<typeof sql<{ total: number }>>,
): Promise<number> {
  const result = await query.execute(trx);
  return result.rows[0]?.total ?? 0;
}

export class KyselyCashSessionRepository implements CashSessionRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  /**
   * UNIQUE(tenant_id, session_date) violation is caught here and
   * re-thrown as SessionAlreadyOpenError — same shape as DbBusyError
   * (packages/db/src/retry.ts): never a raw better-sqlite3 SqliteError
   * crossing this method's boundary. withRetry itself only retries
   * SQLITE_BUSY, so a constraint violation always propagates straight
   * out of it, caught here.
   *
   * Phase 17.5, review round 4 R8: also refuses (before attempting the
   * insert, inside the same transaction) if a DIFFERENT date's session
   * is still open — AnotherSessionStillOpenError, naming that date. At
   * most one session may ever be open at once, which is what makes
   * `getOpenSession()` well-defined. Checking the SAME-date case here
   * too (not just relying on the UNIQUE constraint below) preserves the
   * existing SessionAlreadyOpenError behaviour for that one case.
   */
  async openSession(input: OpenSessionRepoInput): Promise<CashSessionRecord> {
    try {
      return await withRetry(() =>
        this.db.transaction().execute(async (trx) => {
          const openElsewhere = await trx
            .selectFrom('cashSession')
            .select(['sessionDate'])
            .where('tenantId', '=', this.tenantId)
            .where('closedAt', 'is', null)
            .executeTakeFirst();
          if (openElsewhere) {
            if (openElsewhere.sessionDate === input.date) {
              throw new SessionAlreadyOpenError(input.date);
            }
            throw new AnotherSessionStillOpenError(openElsewhere.sessionDate);
          }

          const id = newId();
          const now = new Date().toISOString();

          await trx
            .insertInto('cashSession')
            .values({
              id,
              tenantId: this.tenantId,
              sessionDate: input.date,
              openedAt: now,
              closedAt: null,
              openingCash: input.openingCashPaisa,
              expectedCash: null,
              countedCash: null,
              difference: null,
              openedBy: null,
              closedBy: null,
              notes: null,
            })
            .execute();

          await trx
            .insertInto('auditLog')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              tableName: 'cash_session',
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
              tableName: 'cash_session',
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
            .selectFrom('cashSession')
            .select(CASH_SESSION_COLUMNS)
            .where('id', '=', id)
            .executeTakeFirstOrThrow();

          return toCashSessionRecord(row);
        }),
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new SessionAlreadyOpenError(input.date);
      }
      throw error;
    }
  }

  /**
   * expected_cash formula (PHASE_7.md P7-5 brief, real column names
   * confirmed by reading 0001_init.sql before writing this):
   *   cash_in  = opening_cash
   *            + SUM(sale.total_amount     WHERE sale_date=?, payment_mode='cash', status='confirmed')
   *            + SUM(payment.amount        WHERE payment_date=?, direction='in',  method='cash')
   *   cash_out = SUM(purchase.total_amount WHERE purchase_date=?, payment_mode='cash', status='confirmed')
   *            + SUM(expense.amount        WHERE expense_date=?, method='cash')
   *            + SUM(payment.amount        WHERE payment_date=?, direction='out', method='cash')
   *   expected_cash = cash_in - cash_out
   * Every SUM is COALESCE'd to 0 — a date with no rows in a table must
   * not turn the whole expression into NULL.
   * cash_session is NOT append-only (PHASE_7.md §5 Correction 2) — this
   * UPDATE on the existing row, keyed by id, is correct and intentional.
   * Do not "fix" this into an insert-a-new-row pattern.
   */
  async closeSession(input: CloseSessionRepoInput): Promise<CashSessionRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const existing = await trx
          .selectFrom('cashSession')
          .select(['id', 'sessionDate', 'openingCash', 'closedAt'])
          .where('id', '=', input.sessionId)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!existing) {
          throw new Error(`Cash session ${input.sessionId} not found`);
        }
        if (existing.closedAt !== null) {
          throw new Error(`Cash session ${input.sessionId} is already closed`);
        }

        const date = existing.sessionDate;

        const cashSales = await sumPaisa(
          trx,
          sql<{ total: number }>`
            SELECT COALESCE(SUM(total_amount), 0) AS total FROM sale
            WHERE tenant_id = ${this.tenantId} AND sale_date = ${date}
              AND payment_mode = 'cash' AND status = 'confirmed'
          `,
        );
        const cashPaymentsIn = await sumPaisa(
          trx,
          sql<{ total: number }>`
            SELECT COALESCE(SUM(amount), 0) AS total FROM payment
            WHERE tenant_id = ${this.tenantId} AND payment_date = ${date}
              AND direction = 'in' AND method = 'cash'
          `,
        );
        const cashPurchases = await sumPaisa(
          trx,
          sql<{ total: number }>`
            SELECT COALESCE(SUM(total_amount), 0) AS total FROM purchase
            WHERE tenant_id = ${this.tenantId} AND purchase_date = ${date}
              AND payment_mode = 'cash' AND status = 'confirmed'
          `,
        );
        const cashExpenses = await sumPaisa(
          trx,
          sql<{ total: number }>`
            SELECT COALESCE(SUM(amount), 0) AS total FROM expense
            WHERE tenant_id = ${this.tenantId} AND expense_date = ${date}
              AND method = 'cash'
          `,
        );
        const cashPaymentsOut = await sumPaisa(
          trx,
          sql<{ total: number }>`
            SELECT COALESCE(SUM(amount), 0) AS total FROM payment
            WHERE tenant_id = ${this.tenantId} AND payment_date = ${date}
              AND direction = 'out' AND method = 'cash'
          `,
        );
        // Phase 17.5 (docs/phases/PHASE_17_5.md §2.5), BUG-31. Already
        // signed at insert time (+in / -out — cash_movement.amount,
        // 0021_cash_movement.sql), so this one term folds directly into
        // expectedCashPaisa below with no separate in/out split, unlike
        // the four unsigned terms above.
        const cashMovements = await sumCashMovementsForDate(trx, this.tenantId, date);

        const cashIn = existing.openingCash + cashSales + cashPaymentsIn;
        const cashOut = cashPurchases + cashExpenses + cashPaymentsOut;
        const expectedCashPaisa = cashIn - cashOut + cashMovements;
        const differencePaisa = input.countedCashPaisa - expectedCashPaisa;
        const now = new Date().toISOString();

        await trx
          .updateTable('cashSession')
          .set({
            countedCash: input.countedCashPaisa,
            expectedCash: expectedCashPaisa,
            difference: differencePaisa,
            closedAt: now,
            closedBy: null,
          })
          .where('id', '=', input.sessionId)
          .where('tenantId', '=', this.tenantId)
          .execute();

        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'cash_session',
            recordId: input.sessionId,
            action: 'update',
            changedFields: JSON.stringify({
              countedCash: input.countedCashPaisa,
              expectedCash: expectedCashPaisa,
              difference: differencePaisa,
            }),
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
            tableName: 'cash_session',
            recordId: input.sessionId,
            operation: 'update',
            payload: null,
            createdAt: now,
            syncedAt: null,
            syncAttempts: 0,
            lastError: null,
          })
          .execute();

        const row = await trx
          .selectFrom('cashSession')
          .select(CASH_SESSION_COLUMNS)
          .where('id', '=', input.sessionId)
          .executeTakeFirstOrThrow();

        return toCashSessionRecord(row);
      }),
    );
  }

  async getSessionByDate(date: string): Promise<CashSessionRecord | null> {
    const row = await this.db
      .selectFrom('cashSession')
      .select(CASH_SESSION_COLUMNS)
      .where('tenantId', '=', this.tenantId)
      .where('sessionDate', '=', date)
      .executeTakeFirst();

    return row ? toCashSessionRecord(row) : null;
  }

  /**
   * Phase 17.5, review round 3 R6/R7, round 4 R8 (docs/phases/PHASE_17_5.md §2.8).
   * `WHERE closed_at IS NULL`, deliberately not filtered by
   * `session_date` — a session opened on day D and never closed must
   * still be found on wall-clock D+1. Throws MultipleOpenSessionsError
   * if more than one is found — never silently picks one.
   * `openSession`'s own `AnotherSessionStillOpenError` guard is what
   * keeps at most one open in normal operation; this only guards
   * against the invariant ever being violated some other way (e.g.
   * pre-existing data from before that guard existed).
   */
  async getOpenSession(): Promise<CashSessionRecord | null> {
    const rows = await this.db
      .selectFrom('cashSession')
      .select(CASH_SESSION_COLUMNS)
      .where('tenantId', '=', this.tenantId)
      .where('closedAt', 'is', null)
      .execute();

    if (rows.length > 1) {
      throw new MultipleOpenSessionsError(rows.map((r) => r.sessionDate));
    }
    return rows[0] ? toCashSessionRecord(rows[0]) : null;
  }
}

function toCashSessionRecord(row: {
  id: string;
  sessionDate: string;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  expectedCash: number | null;
  countedCash: number | null;
  difference: number | null;
}): CashSessionRecord {
  return {
    id: row.id,
    sessionDate: row.sessionDate,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    openingCashPaisa: row.openingCash,
    expectedCashPaisa: row.expectedCash,
    countedCashPaisa: row.countedCash,
    differencePaisa: row.difference,
    status: row.closedAt === null ? 'open' : 'closed',
  };
}
