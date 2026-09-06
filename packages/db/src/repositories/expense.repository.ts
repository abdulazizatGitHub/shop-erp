import type { Kysely } from 'kysely';
import { formatDisplayDocNumber, newId } from '@shop/shared';
import type {
  ExpenseCategoryRecord,
  ExpenseRecord,
  ExpenseRepositoryPort,
  ListExpensesRepoInput,
  NewExpenseInput,
} from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

// document_sequence.doc_type's own comment (0001_init.sql) already lists
// 'expense' as an intended value, but no seed row or prefix exists
// anywhere in the migrations — created lazily on first use, same
// insert-if-missing pattern as payment_out/PMT (P7-3) and staff/STF (P7-0).
const EXPENSE_DOC_TYPE = 'expense';
const EXPENSE_DOC_PREFIX = 'EXP';

const EXPENSE_SELECT_COLUMNS = [
  'expense.id',
  'expense.docNo',
  'expense.categoryId',
  'expenseCategory.name as categoryName',
  'expense.expenseDate',
  'expense.amount as amountPaisa',
  'expense.businessUnitId',
  'businessUnit.code as businessUnitCode',
  'expense.vehicle',
  'expense.method',
  'expense.description as notes',
] as const;

export class KyselyExpenseRepository implements ExpenseRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  private async nextExpenseDocNo(trx: Kysely<Database>): Promise<string> {
    const existing = await trx
      .selectFrom('documentSequence')
      .select('nextNumber')
      .where('tenantId', '=', this.tenantId)
      .where('docType', '=', EXPENSE_DOC_TYPE)
      .where('deviceCode', '=', this.deviceCode)
      .executeTakeFirst();

    const nextNumber = existing?.nextNumber ?? 1;

    if (existing) {
      await trx
        .updateTable('documentSequence')
        .set({ nextNumber: nextNumber + 1 })
        .where('tenantId', '=', this.tenantId)
        .where('docType', '=', EXPENSE_DOC_TYPE)
        .where('deviceCode', '=', this.deviceCode)
        .execute();
    } else {
      await trx
        .insertInto('documentSequence')
        .values({
          tenantId: this.tenantId,
          docType: EXPENSE_DOC_TYPE,
          prefix: EXPENSE_DOC_PREFIX,
          deviceCode: this.deviceCode,
          nextNumber: 2,
        })
        .execute();
    }

    return formatDisplayDocNumber(EXPENSE_DOC_PREFIX, nextNumber);
  }

  /**
   * ONE TRANSACTION: expense insert + audit_log + sync_outbox, then a
   * follow-up SELECT (still inside the same transaction) joining
   * expense_category/business_unit to build the DTO — same "insert,
   * then read back with joins" shape advance.repository.ts's
   * recordAdvance uses for its own staff-name lookup.
   */
  async createExpense(input: NewExpenseInput): Promise<ExpenseRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const docNo = await this.nextExpenseDocNo(trx);
        const id = newId();
        const now = new Date().toISOString();

        await trx
          .insertInto('expense')
          .values({
            id,
            tenantId: this.tenantId,
            docNo,
            categoryId: input.categoryId,
            expenseDate: input.expenseDate,
            amount: input.amountPaisa,
            paidTo: null,
            partyId: null,
            method: input.method,
            referenceNo: null,
            jobId: null,
            saleId: null,
            vehicle: input.vehicle,
            description: input.notes,
            receiptPath: null,
            createdAt: now,
            createdBy: null,
            businessUnitId: input.businessUnitId,
          })
          .execute();

        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'expense',
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
            tableName: 'expense',
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
          .selectFrom('expense')
          .innerJoin('expenseCategory', 'expenseCategory.id', 'expense.categoryId')
          .innerJoin('businessUnit', 'businessUnit.id', 'expense.businessUnitId')
          .select(EXPENSE_SELECT_COLUMNS)
          .where('expense.id', '=', id)
          .executeTakeFirstOrThrow();

        return toExpenseRecord(row);
      }),
    );
  }

  async listExpenses(input: ListExpensesRepoInput): Promise<readonly ExpenseRecord[]> {
    const rows = await this.db
      .selectFrom('expense')
      .innerJoin('expenseCategory', 'expenseCategory.id', 'expense.categoryId')
      .innerJoin('businessUnit', 'businessUnit.id', 'expense.businessUnitId')
      .select(EXPENSE_SELECT_COLUMNS)
      .where('expense.tenantId', '=', this.tenantId)
      .where('expense.expenseDate', '>=', input.from)
      .where('expense.expenseDate', '<=', input.to)
      .orderBy('expense.expenseDate', 'desc')
      .execute();

    return rows.map(toExpenseRecord);
  }

  async listCategories(): Promise<readonly ExpenseCategoryRecord[]> {
    const rows = await this.db
      .selectFrom('expenseCategory')
      .select(['id', 'name', 'kind', 'allocationMethod'])
      .where('tenantId', '=', this.tenantId)
      .where('deletedAt', 'is', null)
      .orderBy('sortOrder')
      .execute();

    return rows;
  }
}

function toExpenseRecord(row: {
  id: string;
  docNo: string;
  categoryId: string;
  categoryName: string;
  expenseDate: string;
  amountPaisa: number;
  businessUnitId: string | null;
  businessUnitCode: string;
  vehicle: string | null;
  method: string;
  notes: string | null;
}): ExpenseRecord {
  return {
    id: row.id,
    docNo: row.docNo,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    expenseDate: row.expenseDate,
    amountPaisa: row.amountPaisa,
    businessUnitId: row.businessUnitId ?? '',
    businessUnitCode: row.businessUnitCode as ExpenseRecord['businessUnitCode'],
    vehicle: row.vehicle,
    method: row.method as ExpenseRecord['method'],
    notes: row.notes,
  };
}
