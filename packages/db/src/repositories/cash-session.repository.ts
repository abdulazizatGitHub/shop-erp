import { sql, type Kysely } from 'kysely';
import { newId } from '@shop/shared';
import {
  SessionAlreadyOpenError,
  type CashSessionRecord,
  type CashSessionRepositoryPort,
  type CloseSessionRepoInput,
  type OpenSessionRepoInput,
} from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

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
   */
  async openSession(input: OpenSessionRepoInput): Promise<CashSessionRecord> {
    try {
      return await withRetry(() =>
        this.db.transaction().execute(async (trx) => {
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

        const cashIn = existing.openingCash + cashSales + cashPaymentsIn;
        const cashOut = cashPurchases + cashExpenses + cashPaymentsOut;
        const expectedCashPaisa = cashIn - cashOut;
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
