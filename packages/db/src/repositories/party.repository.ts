import type { Kysely } from 'kysely';
import { formatDocNumber, newId } from '@shop/shared';
import type {
  NewSupplierInput,
  NewSupplierResult,
  PartyRepositoryPort,
  SupplierRecord,
  SupplierSearchQuery,
} from '@shop/core';
import type { Database } from '../kysely-schema.js';

const SUPPLIER_CODE_DOC_TYPE = 'supplier';
const SUPPLIER_CODE_PREFIX = 'SUP';
const SUPPLIER_PARTY_TYPE = 'supplier';

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

    return formatDocNumber(SUPPLIER_CODE_PREFIX, this.deviceCode, nextNumber);
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
