-- =====================================================================
--  ADDENDUM 09 - SALE_LINE ALT UOM
--  Migration version 9.
-- =====================================================================
--
--  WHY THIS EXISTS
--  ADR-0013. When a sale line is entered in an item's alt unit (e.g. 10
--  feet of pipe stocked in kg), sale_line.quantity stores what the
--  customer actually bought (10, in feet) — the snapshot the receipt
--  should show. sale_uom_id/sale_to_stock_factor record which unit and
--  which conversion factor were used, so stock_movement can still be
--  posted in stock_uom milli-units without re-deriving the factor from
--  the item's current alt_uom_factor_milli (docs/DATABASE_RULES.md §3
--  snapshot rule — a later change to the item's factor must not alter
--  a historical sale's stock deduction). Both columns nullable: NULL
--  means the sale line was entered in stock_uom, unchanged from every
--  sale created before this migration.
--
--  No BEGIN/COMMIT here: packages/db/src/migration-runner.ts already
--  wraps db.exec(migration.sql) in its own db.transaction() closure —
--  an explicit BEGIN here would fail with "cannot start a transaction
--  within a transaction" (confirmed in 0006/0007/0008).
-- =====================================================================

ALTER TABLE sale_line ADD COLUMN sale_uom_id TEXT REFERENCES uom(id);
ALTER TABLE sale_line ADD COLUMN sale_to_stock_factor INTEGER;
