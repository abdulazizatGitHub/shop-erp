import type { Kysely } from 'kysely';
import { newId } from '@shop/shared';
import type {
  JobClientRecord,
  JobClientRepositoryPort,
  JobClientSearchQuery,
  NewJobClientInput,
} from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

const JOB_CLIENT_COLUMNS = [
  'jobClient.id',
  'jobClient.name',
  'jobClient.phone',
  'jobClient.phone2',
  'jobClient.address',
  'jobClient.area',
  'jobClient.landmark',
  'jobClient.notes',
] as const;

function toJobClientRecord(row: {
  id: string;
  name: string;
  phone: string | null;
  phone2: string | null;
  address: string | null;
  area: string | null;
  landmark: string | null;
  notes: string | null;
}): JobClientRecord {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    phone2: row.phone2,
    address: row.address,
    area: row.area,
    landmark: row.landmark,
    notes: row.notes,
  };
}

/**
 * Phase 15 — job clients (people bringing in an AC/fridge/oven for
 * repair), a population fully separate from `party` (Q-P15-1 owner
 * decision, BUG-JOBCLIENT-1). No core service wraps these calls — same
 * direct-repository pattern customer.handler.ts already uses for
 * customer create/search/getById, since there is no domain logic here
 * beyond the Zod validation already done at the IPC boundary.
 */
export class KyselyJobClientRepository implements JobClientRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
  ) {}

  async createJobClient(input: NewJobClientInput): Promise<JobClientRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const id = newId();
        const now = new Date().toISOString();

        await trx
          .insertInto('jobClient')
          .values({
            id,
            tenantId: this.tenantId,
            name: input.name,
            phone: input.phone,
            phone2: input.phone2,
            address: input.address,
            area: input.area,
            landmark: input.landmark,
            notes: input.notes,
            createdAt: now,
          })
          .execute();

        const row = await trx
          .selectFrom('jobClient')
          .select(JOB_CLIENT_COLUMNS)
          .where('jobClient.id', '=', id)
          .where('jobClient.tenantId', '=', this.tenantId)
          .executeTakeFirstOrThrow();

        return toJobClientRecord(row);
      }),
    );
  }

  async getJobClientById(id: string): Promise<JobClientRecord | null> {
    const row = await this.db
      .selectFrom('jobClient')
      .select(JOB_CLIENT_COLUMNS)
      .where('jobClient.id', '=', id)
      .where('jobClient.tenantId', '=', this.tenantId)
      .executeTakeFirst();

    if (!row) return null;
    return toJobClientRecord(row);
  }

  /** OD-5 — matches name OR phone (unlike party's searchCustomers, name-only). */
  async searchJobClients(query: JobClientSearchQuery): Promise<readonly JobClientRecord[]> {
    let q = this.db
      .selectFrom('jobClient')
      .select(JOB_CLIENT_COLUMNS)
      .where('jobClient.tenantId', '=', this.tenantId)
      .orderBy('jobClient.name', 'asc')
      .limit(20);

    if (query.query.length > 0) {
      const term = `%${query.query}%`;
      q = q.where((eb) =>
        eb.or([eb('jobClient.name', 'like', term), eb('jobClient.phone', 'like', term)]),
      );
    }

    const rows = await q.execute();
    return rows.map(toJobClientRecord);
  }
}
