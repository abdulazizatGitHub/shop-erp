-- =====================================================================
--  ADDENDUM 08 - ITEM ALT UOM
--  Migration version 8.
-- =====================================================================
--
--  WHY THIS EXISTS
--  ADR-0013, Type 2 (item-specific conversions). Some items sell in a
--  unit different from their stock unit, and the conversion factor
--  varies per item (a specific copper pipe's kg-per-foot weight, not a
--  fixed system constant like uom_conversion holds). Both columns are
--  nullable: NULL means the item sells in stock_uom only, unchanged
--  from every item created before this migration.
--
--  No BEGIN/COMMIT here: packages/db/src/migration-runner.ts already
--  wraps db.exec(migration.sql) in its own db.transaction() closure —
--  an explicit BEGIN here would fail with "cannot start a transaction
--  within a transaction" (confirmed in 0006/0007).
-- =====================================================================

ALTER TABLE item ADD COLUMN alt_uom_id TEXT REFERENCES uom(id);
ALTER TABLE item ADD COLUMN alt_uom_factor_milli INTEGER;
