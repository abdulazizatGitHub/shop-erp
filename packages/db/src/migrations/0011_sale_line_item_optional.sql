-- =====================================================================
--  ADDENDUM 11 - SALE_LINE.ITEM_ID BECOMES OPTIONAL
--  Migration version 11.
-- =====================================================================
--
--  WHY THIS EXISTS
--  P6-5 (job delivery invoice). GAP-2 resolved that labour lines
--  reference service_charge.id, not item_id — a labour line genuinely
--  has no item. But sale_line.item_id has been `TEXT NOT NULL
--  REFERENCES item(id)` since 0001_init.sql:440, predating repair jobs
--  as a concept. Confirmed by direct read of the live DDL before writing
--  this file, not assumed from the original schema comment. Inserting a
--  labour line with item_id = NULL would fail outright against the
--  NOT NULL constraint.
--
--  SQLite has no `ALTER TABLE ... ALTER COLUMN ... DROP NOT NULL`. The
--  only way to relax a NOT NULL constraint is the documented rebuild
--  pattern: rename the old table aside, create the new one with the
--  relaxed constraint, copy every row across with an explicit column
--  list (never `SELECT *` — immune to physical column-order surprises
--  from four rounds of ALTER TABLE ADD COLUMN across 0001/0002/0009/0010),
--  drop the old table, recreate its indexes. No other table has a
--  foreign key referencing sale_line(id), confirmed by grepping every
--  migration file for `REFERENCES sale_line` — zero matches — so this
--  rebuild cannot orphan any other table's constraint.
--
--  Considered and rejected: a placeholder "(Labour)" catalog item so
--  every sale_line keeps a real item_id. Rejected because it reintroduces
--  exactly the "blend service labour into the physical-goods catalog"
--  problem GAP-2 explicitly avoided by choosing service_charge_id over
--  item_id for labour lines in the first place — a placeholder item_id
--  would still be technically wrong data sitting in every report that
--  joins sale_line to item.
--
--  Every column, constraint, and index below is copied EXACTLY from the
--  live schema as of migrations 0001+0002+0009+0010 combined, with only
--  item_id's NOT NULL removed. Nothing else about this table changes.
--
--  No BEGIN/COMMIT here: packages/db/src/migration-runner.ts already
--  wraps db.exec(migration.sql) in its own db.transaction() closure.
-- =====================================================================

ALTER TABLE sale_line RENAME TO sale_line_old;

CREATE TABLE sale_line (
    id                   TEXT PRIMARY KEY,
    tenant_id            TEXT NOT NULL REFERENCES tenant(id),
    sale_id              TEXT NOT NULL REFERENCES sale(id),
    line_no              INTEGER NOT NULL,
    item_id              TEXT REFERENCES item(id),   -- NOT NULL removed; NULL = labour line
    description          TEXT,
    quantity             INTEGER NOT NULL,
    unit_price           INTEGER NOT NULL,
    unit_cost            INTEGER,
    discount_amount      INTEGER NOT NULL DEFAULT 0,
    tax_rate             INTEGER NOT NULL DEFAULT 0,
    tax_amount           INTEGER NOT NULL DEFAULT 0,
    line_total           INTEGER NOT NULL,
    serial_id            TEXT REFERENCES item_serial(id),
    warranty_months      INTEGER NOT NULL DEFAULT 0,
    business_unit_id     TEXT REFERENCES business_unit(id),
    line_kind            TEXT NOT NULL DEFAULT 'part',
    job_part_id          TEXT,
    sale_uom_id          TEXT REFERENCES uom(id),
    sale_to_stock_factor INTEGER,
    payer_party_id       TEXT REFERENCES party(id),
    revenue_type         TEXT NOT NULL DEFAULT 'customer_paid',
    service_charge_id    TEXT REFERENCES service_charge(id)
);

INSERT INTO sale_line (
    id, tenant_id, sale_id, line_no, item_id, description, quantity, unit_price,
    unit_cost, discount_amount, tax_rate, tax_amount, line_total, serial_id,
    warranty_months, business_unit_id, line_kind, job_part_id, sale_uom_id,
    sale_to_stock_factor, payer_party_id, revenue_type, service_charge_id
)
SELECT
    id, tenant_id, sale_id, line_no, item_id, description, quantity, unit_price,
    unit_cost, discount_amount, tax_rate, tax_amount, line_total, serial_id,
    warranty_months, business_unit_id, line_kind, job_part_id, sale_uom_id,
    sale_to_stock_factor, payer_party_id, revenue_type, service_charge_id
FROM sale_line_old;

DROP TABLE sale_line_old;

CREATE INDEX idx_sl_sale ON sale_line (sale_id);
CREATE INDEX idx_sl_item ON sale_line (tenant_id, item_id);

-- ---------------------------------------------------------------------
-- SQLite gotcha, found by actually running this migration and seeing it
-- fail, not assumed: `ALTER TABLE ... RENAME TO` automatically rewrites
-- any VIEW/TRIGGER that references the renamed table to use the new
-- name. So the `ALTER TABLE sale_line RENAME TO sale_line_old` above
-- silently rewrote v_unit_pl and v_unit_revenue (both join `sale_line`,
-- added in 0002/0003) to reference `sale_line_old` — which this
-- migration then drops. Confirmed by grepping every migration file for
-- `FROM        sale_line sl` and `JOIN        sale_line sl`: exactly
-- these two views, no others (v_job_split as of 0010 does not reference
-- sale_line at all; that only becomes true in 0012, which runs after
-- sale_line already has its final name, so it is unaffected). Re-created
-- verbatim below — SQL unchanged from 0002/0003, only re-bound to the
-- correct table.
-- ---------------------------------------------------------------------

DROP VIEW IF EXISTS v_unit_pl;
CREATE VIEW v_unit_pl AS
SELECT  sl.tenant_id,
        s.sale_date,
        bu.code                                                 AS unit_code,
        bu.name                                                 AS unit_name,
        sl.line_kind,
        SUM(sl.line_total)                                      AS revenue_paisa,
        SUM(COALESCE(sl.unit_cost, 0) * sl.quantity / 1000)     AS cogs_paisa,
        SUM(sl.line_total - COALESCE(sl.unit_cost, 0) * sl.quantity / 1000)
                                                                AS gross_margin_paisa
FROM        sale_line sl
JOIN        sale s          ON s.id  = sl.sale_id
LEFT JOIN   business_unit bu ON bu.id = sl.business_unit_id
WHERE       s.status = 'confirmed'
GROUP BY    sl.tenant_id, s.sale_date, bu.code, bu.name, sl.line_kind;

DROP VIEW IF EXISTS v_unit_revenue;
CREATE VIEW v_unit_revenue AS
SELECT  sl.tenant_id,
        s.sale_date,
        bu.code                                                     AS unit_code,
        SUM(sl.line_total)                                          AS revenue_paisa,
        SUM(COALESCE(sl.unit_cost, 0) * sl.quantity / 1000)         AS cogs_paisa
FROM        sale_line sl
JOIN        sale s           ON s.id  = sl.sale_id
JOIN        business_unit bu ON bu.id = sl.business_unit_id
WHERE       s.status = 'confirmed'
GROUP BY    sl.tenant_id, s.sale_date, bu.code;
