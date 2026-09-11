-- =====================================================================
--  ADDENDUM 13 - ITEM CODE REFORMAT (ADR-0012 SCOPE REVERSAL)
--  Migration version 13.
-- =====================================================================
--
--  WHY THIS EXISTS
--  ADR-0012 originally excluded item.item_code from its PREFIX-NNNN
--  reformat (see PROJECT.md BUG-X, 2026-08-30: "item codes are
--  internal catalogue references, not customer-facing document
--  numbers"). That decision is reversed (owner, 2026-09-11) — item
--  codes now follow the same PREFIX-NNNN format as every other
--  document number in the system (see ADR-0012's updated text).
--
--  Every item code minted so far used
--  formatDocNumber(prefix, deviceCode, sequence), producing
--  ITM-DEVICECODE-NNNNNN (6-digit padding, device code embedded —
--  e.g. 'ITM-A-000001'). This migration reformats every existing row
--  already in that old shape to ITM-NNNN (4-digit minimum), using the
--  exact same GLOB-guarded, idempotent pattern as 0006's sale/
--  purchase/payment/party_code reformat.
--
--  item_code is declared only on the item table (0001_init.sql,
--  UNIQUE (tenant_id, item_code)) — no other table denormalizes it;
--  every other table references items by item_id (UUID FK). So unlike
--  0006, this migration touches exactly one table.
--
--  document_sequence's existing 'item'/'ITM' row needs no change: its
--  prefix is already 'ITM' and its next_number already reflects the
--  count of existing items. Its device_code column is deliberately
--  left as-is, matching every other doc_type row (sale, purchase,
--  customer, supplier, etc. all still carry a non-null device_code
--  today) and ADR-0012 rule 4 ("device_code remains... for future
--  multi-device collision prevention but is NOT included in the
--  displayed number") — nulling it would make this row inconsistent
--  with its siblings, not more consistent.
--
--  No BEGIN/COMMIT here: packages/db/src/migration-runner.ts already
--  wraps db.exec(migration.sql) in its own db.transaction() closure —
--  an explicit BEGIN here would fail with "cannot start a transaction
--  within a transaction".
-- =====================================================================

-- ---- item.item_code ----
UPDATE item SET item_code = substr(item_code, 1, instr(item_code, '-') - 1) || '-' ||
    printf('%04d', CAST(substr(item_code, -6) AS INTEGER))
WHERE item_code GLOB '*-*-[0-9][0-9][0-9][0-9][0-9][0-9]'
  AND CAST(substr(item_code, -6) AS INTEGER) < 10000;

UPDATE item SET item_code = substr(item_code, 1, instr(item_code, '-') - 1) || '-' ||
    CAST(CAST(substr(item_code, -6) AS INTEGER) AS TEXT)
WHERE item_code GLOB '*-*-[0-9][0-9][0-9][0-9][0-9][0-9]'
  AND CAST(substr(item_code, -6) AS INTEGER) >= 10000;
