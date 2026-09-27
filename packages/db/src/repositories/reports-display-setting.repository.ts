import type { Kysely } from 'kysely';
import type { Database } from '../kysely-schema.js';

// P17-3 (docs/phases/PHASE_17.md §2.5, S17-REP-1). Own file, same
// "extracted before setting.repository.ts crosses ~300 lines" convention
// as stock-alerts-setting.repository.ts — plain key-value pattern, no
// core port/service (CLAUDE.md §10 — not a generic key/value
// passthrough, this is its own fixed, named setting).

export type RowsPerPage = 10 | 25 | 50;

const ROWS_PER_PAGE_KEY = 'rowsPerPage';
const DEFAULT_ROWS_PER_PAGE: RowsPerPage = 10;

function parseRowsPerPage(value: string | null): RowsPerPage | null {
  if (value === '10' || value === '25' || value === '50') {
    return Number(value) as RowsPerPage;
  }
  return null;
}

/** Q17-2 (ANSWERED) — default 10, same as every existing report table's own hardcoded constant. */
export async function getRowsPerPage(db: Kysely<Database>, tenantId: string): Promise<RowsPerPage> {
  const row = await db
    .selectFrom('setting')
    .select('value')
    .where('tenantId', '=', tenantId)
    .where('key', '=', ROWS_PER_PAGE_KEY)
    .executeTakeFirst();

  return parseRowsPerPage(row?.value ?? null) ?? DEFAULT_ROWS_PER_PAGE;
}

export async function setRowsPerPage(
  db: Kysely<Database>,
  tenantId: string,
  value: RowsPerPage,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const stringValue = String(value);
  await db
    .insertInto('setting')
    .values({ tenantId, key: ROWS_PER_PAGE_KEY, value: stringValue, updatedAt })
    .onConflict((oc) =>
      oc.columns(['tenantId', 'key']).doUpdateSet({ value: stringValue, updatedAt }),
    )
    .execute();
}
