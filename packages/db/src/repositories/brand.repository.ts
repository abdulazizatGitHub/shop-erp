import { newId } from '@shop/shared';
import type { BrandRecord, BrandRepositoryPort, NewBrandInput } from '@shop/core';
import type { Kysely } from 'kysely';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

interface BrandRow {
  readonly id: string;
  readonly name: string;
  readonly isActive: number;
}

function toRecord(row: BrandRow): BrandRecord {
  return { id: row.id, name: row.name, isActive: row.isActive === 1 };
}

export class KyselyBrandRepository implements BrandRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
  ) {}

  /**
   * Case-insensitive uniqueness, including soft-deleted rows (§2c —
   * re-using a deleted name would collide with UNIQUE(tenant_id, name)
   * and break CSV import's own name-based matching). Checked in
   * application code, not a DB collation — same reasoning as
   * service-charge.repository.ts's assertNameAvailable.
   */
  private async assertNameAvailable(trx: Kysely<Database>, name: string): Promise<void> {
    const rows = await trx
      .selectFrom('brand')
      .select(['name'])
      .where('tenantId', '=', this.tenantId)
      .execute();
    const normalized = name.trim().toLowerCase();
    const clash = rows.some((r) => r.name.trim().toLowerCase() === normalized);
    if (clash) {
      throw new Error(`A brand named "${name}" already exists`);
    }
  }

  private async getByIdOrThrow(trx: Kysely<Database>, id: string): Promise<BrandRecord> {
    const row = await trx
      .selectFrom('brand')
      .select(['id', 'name', 'isActive'])
      .where('id', '=', id)
      .where('tenantId', '=', this.tenantId)
      .executeTakeFirstOrThrow();
    return toRecord(row);
  }

  async createBrand(input: NewBrandInput): Promise<BrandRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        await this.assertNameAvailable(trx, input.name);
        const id = newId();
        await trx
          .insertInto('brand')
          .values({
            id,
            tenantId: this.tenantId,
            name: input.name,
            deletedAt: null,
            isActive: 1,
          })
          .execute();
        return this.getByIdOrThrow(trx, id);
      }),
    );
  }

  async toggleBrandActive(id: string, isActive: boolean): Promise<BrandRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const existing = await trx
          .selectFrom('brand')
          .select('id')
          .where('id', '=', id)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!existing) {
          throw new Error(`Brand ${id} not found`);
        }
        await trx
          .updateTable('brand')
          .set({ isActive: isActive ? 1 : 0 })
          .where('id', '=', id)
          .where('tenantId', '=', this.tenantId)
          .execute();
        return this.getByIdOrThrow(trx, id);
      }),
    );
  }

  async listBrandsAdmin(): Promise<readonly BrandRecord[]> {
    const rows = await this.db
      .selectFrom('brand')
      .select(['id', 'name', 'isActive'])
      .where('tenantId', '=', this.tenantId)
      .where('deletedAt', 'is', null)
      .orderBy('name')
      .execute();
    return rows.map(toRecord);
  }
}
