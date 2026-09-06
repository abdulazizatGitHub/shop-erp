import { sql, type Kysely } from 'kysely';
import { formatDisplayDocNumber, newId } from '@shop/shared';
import type {
  CustomerBalance,
  CustomerRecord,
  CustomerSearchQuery,
  NewCustomerInput,
  NewCustomerResult,
  NewStaffInput,
  NewStaffResult,
  NewSupplierInput,
  NewSupplierResult,
  PartyRepositoryPort,
  StaffRecord,
  StaffRole,
  SupplierBalance,
  SupplierRecord,
  SupplierSearchQuery,
} from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

const SUPPLIER_CODE_DOC_TYPE = 'supplier';
const SUPPLIER_CODE_PREFIX = 'SUP';
const SUPPLIER_PARTY_TYPE = 'supplier';

const CUSTOMER_CODE_DOC_TYPE = 'customer';
const CUSTOMER_CODE_PREFIX = 'CUS';
const CUSTOMER_PARTY_TYPE = 'customer';

const STAFF_CODE_DOC_TYPE = 'staff';
const STAFF_CODE_PREFIX = 'STF';
const STAFF_PARTY_TYPE = 'staff';

const STAFF_COLUMNS = [
  'party.id',
  'party.partyCode',
  'party.name',
  'party.phone',
  'party.staffRole',
  'party.wageRate',
  'party.commissionBp',
  'party.createdAt',
] as const;

const CUSTOMER_COLUMNS = [
  'party.id',
  'party.partyCode',
  'party.name',
  'party.shopName',
  'party.phone',
  'party.customerType',
  'party.priceLevelId',
  'party.creditLimit',
  'party.notes',
] as const;

const SUPPLIER_COLUMNS = [
  'party.id',
  'party.partyCode',
  'party.name',
  'party.shopName',
  'party.phone',
  'party.cityArea',
  'party.paymentTerms',
  'party.notes',
] as const;

export class KyselyPartyRepository implements PartyRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  private async nextSupplierCode(trx: Kysely<Database>): Promise<string> {
    const existing = await trx
      .selectFrom('documentSequence')
      .select('nextNumber')
      .where('tenantId', '=', this.tenantId)
      .where('docType', '=', SUPPLIER_CODE_DOC_TYPE)
      .where('deviceCode', '=', this.deviceCode)
      .executeTakeFirst();

    const nextNumber = existing?.nextNumber ?? 1;

    if (existing) {
      await trx
        .updateTable('documentSequence')
        .set({ nextNumber: nextNumber + 1 })
        .where('tenantId', '=', this.tenantId)
        .where('docType', '=', SUPPLIER_CODE_DOC_TYPE)
        .where('deviceCode', '=', this.deviceCode)
        .execute();
    } else {
      await trx
        .insertInto('documentSequence')
        .values({
          tenantId: this.tenantId,
          docType: SUPPLIER_CODE_DOC_TYPE,
          prefix: SUPPLIER_CODE_PREFIX,
          deviceCode: this.deviceCode,
          nextNumber: 2,
        })
        .execute();
    }

    return formatDisplayDocNumber(SUPPLIER_CODE_PREFIX, nextNumber);
  }

  async createSupplier(input: NewSupplierInput): Promise<NewSupplierResult> {
    return this.db.transaction().execute(async (trx) => {
      const partyCode = input.partyCode ?? (await this.nextSupplierCode(trx));
      const id = newId();
      const now = new Date().toISOString();

      await trx
        .insertInto('party')
        .values({
          id,
          tenantId: this.tenantId,
          partyCode,
          partyType: SUPPLIER_PARTY_TYPE,
          name: input.name,
          shopName: input.shopName,
          phone: input.phone,
          cityArea: input.cityArea,
          paymentTerms: input.paymentTerms,
          customerType: null,
          priceLevelId: null,
          creditLimit: null,
          notes: input.notes,
          isActive: 1,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
        .execute();

      return { id, partyCode };
    });
  }

  async getSupplierById(id: string): Promise<SupplierRecord | null> {
    const row = await this.db
      .selectFrom('party')
      .select(SUPPLIER_COLUMNS)
      .where('party.id', '=', id)
      .where('party.tenantId', '=', this.tenantId)
      .where('party.partyType', '=', SUPPLIER_PARTY_TYPE)
      .where('party.deletedAt', 'is', null)
      .executeTakeFirst();

    if (!row) return null;
    return toSupplierRecord(row);
  }

  async searchSuppliers(query: SupplierSearchQuery): Promise<readonly SupplierRecord[]> {
    let q = this.db
      .selectFrom('party')
      .select(SUPPLIER_COLUMNS)
      .where('party.tenantId', '=', this.tenantId)
      .where('party.partyType', '=', SUPPLIER_PARTY_TYPE)
      .where('party.deletedAt', 'is', null);

    if (query.query.length > 0) {
      q = q.where('party.name', 'like', `%${query.query}%`);
    }

    const rows = await q.execute();
    return rows.map(toSupplierRecord);
  }

  /**
   * Reads v_party_balance directly (docs/SYSTEM_DESIGN.md §7 — reports
   * read from views, never re-implement the aggregation), same pattern
   * as getCustomerBalance. The view carries `name` for free; it does not
   * carry `party_code`, so this type omits it rather than adding a join.
   */
  async getSupplierBalance(supplierId: string): Promise<SupplierBalance> {
    const result = await sql<{ name: string; balancePaisa: number }>`
      SELECT name, balance_paisa AS balancePaisa
      FROM v_party_balance
      WHERE party_id = ${supplierId} AND tenant_id = ${this.tenantId}
    `.execute(this.db);

    const row = result.rows[0];
    if (!row) {
      throw new Error(`Supplier ${supplierId} not found`);
    }
    return { supplierId, name: row.name, balancePaisa: row.balancePaisa };
  }

  private async nextCustomerCode(trx: Kysely<Database>): Promise<string> {
    const existing = await trx
      .selectFrom('documentSequence')
      .select('nextNumber')
      .where('tenantId', '=', this.tenantId)
      .where('docType', '=', CUSTOMER_CODE_DOC_TYPE)
      .where('deviceCode', '=', this.deviceCode)
      .executeTakeFirst();

    const nextNumber = existing?.nextNumber ?? 1;

    if (existing) {
      await trx
        .updateTable('documentSequence')
        .set({ nextNumber: nextNumber + 1 })
        .where('tenantId', '=', this.tenantId)
        .where('docType', '=', CUSTOMER_CODE_DOC_TYPE)
        .where('deviceCode', '=', this.deviceCode)
        .execute();
    } else {
      await trx
        .insertInto('documentSequence')
        .values({
          tenantId: this.tenantId,
          docType: CUSTOMER_CODE_DOC_TYPE,
          prefix: CUSTOMER_CODE_PREFIX,
          deviceCode: this.deviceCode,
          nextNumber: 2,
        })
        .execute();
    }

    return formatDisplayDocNumber(CUSTOMER_CODE_PREFIX, nextNumber);
  }

  /** Write path — wrapped in withRetry per PROJECT.md BUG-15. */
  async createCustomer(input: NewCustomerInput): Promise<NewCustomerResult> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const partyCode = input.partyCode ?? (await this.nextCustomerCode(trx));
        const id = newId();
        const now = new Date().toISOString();

        await trx
          .insertInto('party')
          .values({
            id,
            tenantId: this.tenantId,
            partyCode,
            partyType: CUSTOMER_PARTY_TYPE,
            name: input.name,
            shopName: input.shopName,
            phone: input.phone,
            cityArea: null,
            paymentTerms: null,
            customerType: input.customerType,
            priceLevelId: input.priceLevelId,
            creditLimit: input.creditLimitPaisa,
            notes: input.notes,
            isActive: 1,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          })
          .execute();

        return { id, partyCode };
      }),
    );
  }

  async getCustomerById(id: string): Promise<CustomerRecord | null> {
    const row = await this.db
      .selectFrom('party')
      .select(CUSTOMER_COLUMNS)
      .where('party.id', '=', id)
      .where('party.tenantId', '=', this.tenantId)
      .where('party.partyType', '=', CUSTOMER_PARTY_TYPE)
      .where('party.deletedAt', 'is', null)
      .executeTakeFirst();

    if (!row) return null;
    return toCustomerRecord(row);
  }

  async searchCustomers(query: CustomerSearchQuery): Promise<readonly CustomerRecord[]> {
    let q = this.db
      .selectFrom('party')
      .select(CUSTOMER_COLUMNS)
      .where('party.tenantId', '=', this.tenantId)
      .where('party.partyType', '=', CUSTOMER_PARTY_TYPE)
      .where('party.deletedAt', 'is', null);

    if (query.query.length > 0) {
      q = q.where('party.name', 'like', `%${query.query}%`);
    }

    const rows = await q.execute();
    return rows.map(toCustomerRecord);
  }

  /**
   * Reads v_party_balance directly (docs/SYSTEM_DESIGN.md §7 — reports
   * read from views, never re-implement the aggregation). Kysely has no
   * typed binding for the view, so this goes through a raw `sql`
   * template against the same connection Kysely already holds, rather
   * than a second raw better-sqlite3 handle.
   */
  async getCustomerBalance(customerId: string): Promise<CustomerBalance> {
    const result = await sql<{ balancePaisa: number }>`
      SELECT balance_paisa AS balancePaisa
      FROM v_party_balance
      WHERE party_id = ${customerId} AND tenant_id = ${this.tenantId}
    `.execute(this.db);

    const row = result.rows[0];
    if (!row) {
      throw new Error(`Customer ${customerId} not found`);
    }
    return { customerId, balancePaisa: row.balancePaisa };
  }

  private async nextStaffCode(trx: Kysely<Database>): Promise<string> {
    const existing = await trx
      .selectFrom('documentSequence')
      .select('nextNumber')
      .where('tenantId', '=', this.tenantId)
      .where('docType', '=', STAFF_CODE_DOC_TYPE)
      .where('deviceCode', '=', this.deviceCode)
      .executeTakeFirst();

    const nextNumber = existing?.nextNumber ?? 1;

    if (existing) {
      await trx
        .updateTable('documentSequence')
        .set({ nextNumber: nextNumber + 1 })
        .where('tenantId', '=', this.tenantId)
        .where('docType', '=', STAFF_CODE_DOC_TYPE)
        .where('deviceCode', '=', this.deviceCode)
        .execute();
    } else {
      await trx
        .insertInto('documentSequence')
        .values({
          tenantId: this.tenantId,
          docType: STAFF_CODE_DOC_TYPE,
          prefix: STAFF_CODE_PREFIX,
          deviceCode: this.deviceCode,
          nextNumber: 2,
        })
        .execute();
    }

    return formatDisplayDocNumber(STAFF_CODE_PREFIX, nextNumber);
  }

  /**
   * Write path — wrapped in withRetry per PROJECT.md BUG-15, same as
   * createCustomer. business_unit_id is left NULL on the party row —
   * PHASE_7.md Correction C derives and stores a unit on `attendance`,
   * not on `party`, at attendance-save time.
   */
  async createStaff(input: NewStaffInput): Promise<NewStaffResult> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const partyCode = await this.nextStaffCode(trx);
        const id = newId();
        const now = new Date().toISOString();

        await trx
          .insertInto('party')
          .values({
            id,
            tenantId: this.tenantId,
            partyCode,
            partyType: STAFF_PARTY_TYPE,
            name: input.name,
            shopName: null,
            phone: input.phone,
            cityArea: null,
            paymentTerms: null,
            customerType: null,
            priceLevelId: null,
            creditLimit: null,
            staffRole: input.staffRole,
            wageRate: input.wageRatePaisa,
            commissionBp: input.commissionBp,
            notes: null,
            isActive: 1,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          })
          .execute();

        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'party',
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
            tableName: 'party',
            recordId: id,
            operation: 'insert',
            payload: null,
            createdAt: now,
            syncedAt: null,
            syncAttempts: 0,
            lastError: null,
          })
          .execute();

        return { id, partyCode };
      }),
    );
  }

  async getStaffById(id: string): Promise<StaffRecord | null> {
    const row = await this.db
      .selectFrom('party')
      .select(STAFF_COLUMNS)
      .where('party.id', '=', id)
      .where('party.tenantId', '=', this.tenantId)
      .where('party.partyType', '=', STAFF_PARTY_TYPE)
      .where('party.deletedAt', 'is', null)
      .executeTakeFirst();

    if (!row) return null;
    return toStaffRecord(row);
  }

  async listStaff(): Promise<readonly StaffRecord[]> {
    const rows = await this.db
      .selectFrom('party')
      .select(STAFF_COLUMNS)
      .where('party.tenantId', '=', this.tenantId)
      .where('party.partyType', '=', STAFF_PARTY_TYPE)
      .where('party.deletedAt', 'is', null)
      .orderBy('party.name')
      .execute();

    return rows.map(toStaffRecord);
  }
}

function toCustomerRecord(row: {
  id: string;
  partyCode: string;
  name: string;
  shopName: string | null;
  phone: string | null;
  customerType: string | null;
  priceLevelId: string | null;
  creditLimit: number | null;
  notes: string | null;
}): CustomerRecord {
  return {
    id: row.id,
    partyCode: row.partyCode,
    name: row.name,
    shopName: row.shopName,
    phone: row.phone,
    customerType: row.customerType as CustomerRecord['customerType'],
    priceLevelId: row.priceLevelId,
    creditLimitPaisa: row.creditLimit,
    notes: row.notes,
  };
}

function toStaffRecord(row: {
  id: string;
  partyCode: string;
  name: string;
  phone: string | null;
  staffRole: string | null;
  wageRate: number | null;
  commissionBp: number | null;
  createdAt: string;
}): StaffRecord {
  return {
    id: row.id,
    partyCode: row.partyCode,
    name: row.name,
    phone: row.phone,
    staffRole: row.staffRole as StaffRole,
    wageRatePaisa: row.wageRate ?? 0,
    commissionBp: row.commissionBp ?? 0,
    createdAt: row.createdAt,
  };
}

function toSupplierRecord(row: {
  id: string;
  partyCode: string;
  name: string;
  shopName: string | null;
  phone: string | null;
  cityArea: string | null;
  paymentTerms: string | null;
  notes: string | null;
}): SupplierRecord {
  return {
    id: row.id,
    partyCode: row.partyCode,
    name: row.name,
    shopName: row.shopName,
    phone: row.phone,
    cityArea: row.cityArea,
    paymentTerms: row.paymentTerms,
    notes: row.notes,
  };
}
