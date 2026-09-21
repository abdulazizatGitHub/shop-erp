import { z } from 'zod';

/**
 * Phase 15 — job clients (people bringing in an AC/fridge/oven for
 * repair) are a separate population from the Spare Parts ledger's
 * `party`/customer.* contracts (BUG-JOBCLIENT-1, Q-P15-1 owner decision:
 * a dedicated `job_client` table, not `party_type='job_client'`). Field
 * set mirrors OD-2's exact `job_client` column list — see
 * `packages/db/src/migrations/0016_job_client.sql`.
 */
export const CreateJobClientInput = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1).nullable(),
  phone2: z.string().trim().min(1).nullable(),
  address: z.string().trim().min(1).nullable(),
  area: z.string().trim().min(1).nullable(),
  landmark: z.string().trim().min(1).nullable(),
  notes: z.string().trim().min(1).nullable(),
});
export type CreateJobClientInput = z.infer<typeof CreateJobClientInput>;

/** Same `{ query }` shape as CustomerSearchInput — matched against name OR phone. */
export const SearchJobClientsInput = z.object({
  query: z.string().trim().default(''),
});
export type SearchJobClientsInput = z.infer<typeof SearchJobClientsInput>;

export const JobClientIdInput = z.object({
  id: z.string().uuid(),
});
export type JobClientIdInput = z.infer<typeof JobClientIdInput>;

export const JobClientDto = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  phone2: z.string().nullable(),
  address: z.string().nullable(),
  area: z.string().nullable(),
  landmark: z.string().nullable(),
  notes: z.string().nullable(),
});
export type JobClientDto = z.infer<typeof JobClientDto>;
