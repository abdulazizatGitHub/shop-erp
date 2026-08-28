-- =====================================================================
--  ADDENDUM 07 - UOM CONVERSION TABLE
--  Migration version 7.
-- =====================================================================
--
--  WHY THIS EXISTS
--  ADR-0013, Type 1 (fixed system conversions). Standard physical
--  conversions that never change per item (1 Kg = 1000 Gram, 1 Foot =
--  12 Inch, etc.), distinct from item-specific conversions
--  (item.alt_uom_id/alt_uom_factor_milli, added in a later migration).
--  No seed data here — seeding the 4 fixed conversions is bootstrap.ts's
--  job (P3.5E), matching how UoM/business-unit rows are already seeded
--  there rather than in a migration.
--
--  No BEGIN/COMMIT here: packages/db/src/migration-runner.ts already
--  wraps db.exec(migration.sql) in its own db.transaction() closure —
--  an explicit BEGIN here would fail with "cannot start a transaction
--  within a transaction" (confirmed in 0006).
-- =====================================================================

CREATE TABLE uom_conversion (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    from_uom_id     TEXT NOT NULL REFERENCES uom(id),
    to_uom_id       TEXT NOT NULL REFERENCES uom(id),
    factor_milli    INTEGER NOT NULL,
      -- how many to_uom milli-units per 1 from_uom unit
      -- e.g. Kg -> Gram: factor_milli = 1000000 (1 Kg = 1000 Gram, stored as 1000 * 1000)
    UNIQUE (tenant_id, from_uom_id, to_uom_id)
);
CREATE INDEX idx_uom_conv_from ON uom_conversion (tenant_id, from_uom_id);
