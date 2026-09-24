import { newId } from '@shop/shared';
import {
  deriveCommissionMode,
  type NewServiceChargeInput,
  type ServiceChargeRecord,
  type ServiceChargeRepositoryPort,
  type UpdateServiceChargeFields,
} from '@shop/core';
import type { Kysely } from 'kysely';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

interface ServiceChargeRow {
  readonly id: string;
  readonly name: string;
  readonly jobType: string | null;
  readonly retailCharge: number;
  readonly wholesaleCharge: number | null;
  readonly commissionAmount: number | null;
  readonly commissionBp: number | null;
  readonly typicalMinutes: number | null;
  readonly isActive: number;
  readonly notes: string | null;
  readonly createdAt: string;
}

function toRecord(row: ServiceChargeRow): ServiceChargeRecord {
  return {
    id: row.id,
    name: row.name,
    jobType: row.jobType,
    retailChargePaisa: row.retailCharge,
    wholesaleChargePaisa: row.wholesaleCharge,
    commissionMode: deriveCommissionMode(row.commissionAmount, row.commissionBp),
    commissionAmountPaisa: row.commissionAmount,
    commissionBp: row.commissionBp,
    typicalMinutes: row.typicalMinutes,
    isActive: row.isActive === 1,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

export class KyselyServiceChargeRepository implements ServiceChargeRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
  ) {}

  /**
   * Case-insensitive uniqueness, checked in application code rather than
   * a DB collation (CLAUDE.md §3.7, no business logic in SQL) — same
   * reasoning as import.repository.ts's brandIdByName normalize()
   * matching. At this shop's scale (a handful of charge types), loading
   * every name for the tenant and comparing in JS is simpler and clearer
   * than a SQL LOWER() predicate.
   */
  private async assertNameAvailable(
    trx: Kysely<Database>,
    name: string,
    excludeId: string | null,
  ): Promise<void> {
    const rows = await trx
      .selectFrom('serviceCharge')
      .select(['id', 'name'])
      .where('tenantId', '=', this.tenantId)
      .execute();
    const normalized = name.trim().toLowerCase();
    const clash = rows.find(
      (r) => r.id !== excludeId && r.name.trim().toLowerCase() === normalized,
    );
    if (clash) {
      throw new Error(`A service charge named "${name}" already exists`);
    }
  }

  /** Same lookup-by-code convention as job-delivery.repository.ts's repairUnit — never hardcoded. */
  private async resolveRepairUnitId(trx: Kysely<Database>): Promise<string> {
    const row = await trx
      .selectFrom('businessUnit')
      .select('id')
      .where('tenantId', '=', this.tenantId)
      .where('code', '=', 'REPAIR')
      .executeTakeFirst();
    if (!row) {
      throw new Error(
        `REPAIR business unit not found for tenant ${this.tenantId} — has the seed run?`,
      );
    }
    return row.id;
  }

  private async getByIdOrThrow(trx: Kysely<Database>, id: string): Promise<ServiceChargeRecord> {
    const row = await trx
      .selectFrom('serviceCharge')
      .selectAll()
      .where('id', '=', id)
      .where('tenantId', '=', this.tenantId)
      .executeTakeFirstOrThrow();
    return toRecord(row);
  }

  async createServiceCharge(input: NewServiceChargeInput): Promise<ServiceChargeRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        await this.assertNameAvailable(trx, input.name, null);
        const businessUnitId = await this.resolveRepairUnitId(trx);
        const id = newId();
        const now = new Date().toISOString();
        await trx
          .insertInto('serviceCharge')
          .values({
            id,
            tenantId: this.tenantId,
            businessUnitId,
            name: input.name,
            jobType: input.jobType,
            retailCharge: input.retailChargePaisa,
            wholesaleCharge: input.wholesaleChargePaisa,
            commissionAmount: input.commissionAmountPaisa,
            commissionBp: input.commissionBp,
            typicalMinutes: input.typicalMinutes,
            isActive: 1,
            notes: input.notes,
            createdAt: now,
          })
          .execute();
        return this.getByIdOrThrow(trx, id);
      }),
    );
  }

  /** Never touches sale_line — see the port's doc comment; a past delivery's snapshot is untouched by any edit here. */
  async updateServiceCharge(input: UpdateServiceChargeFields): Promise<ServiceChargeRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const existing = await trx
          .selectFrom('serviceCharge')
          .select('id')
          .where('id', '=', input.id)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!existing) {
          throw new Error(`Service charge ${input.id} not found`);
        }
        await this.assertNameAvailable(trx, input.name, input.id);
        await trx
          .updateTable('serviceCharge')
          .set({
            name: input.name,
            jobType: input.jobType,
            retailCharge: input.retailChargePaisa,
            wholesaleCharge: input.wholesaleChargePaisa,
            commissionAmount: input.commissionAmountPaisa,
            commissionBp: input.commissionBp,
            typicalMinutes: input.typicalMinutes,
            notes: input.notes,
          })
          .where('id', '=', input.id)
          .where('tenantId', '=', this.tenantId)
          .execute();
        return this.getByIdOrThrow(trx, input.id);
      }),
    );
  }

  async toggleServiceCharge(id: string, isActive: boolean): Promise<ServiceChargeRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const existing = await trx
          .selectFrom('serviceCharge')
          .select('id')
          .where('id', '=', id)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!existing) {
          throw new Error(`Service charge ${id} not found`);
        }
        await trx
          .updateTable('serviceCharge')
          .set({ isActive: isActive ? 1 : 0 })
          .where('id', '=', id)
          .where('tenantId', '=', this.tenantId)
          .execute();
        return this.getByIdOrThrow(trx, id);
      }),
    );
  }

  async listServiceChargesAdmin(): Promise<readonly ServiceChargeRecord[]> {
    const rows = await this.db
      .selectFrom('serviceCharge')
      .selectAll()
      .where('tenantId', '=', this.tenantId)
      .orderBy('name')
      .execute();
    return rows.map(toRecord);
  }
}
