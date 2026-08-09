-- =====================================================================
--  ADDENDUM 03 - SHARED OVERHEAD & UNIT P&L
--  Apply AFTER 0002_business_units.sql.  Migration version 3.
-- =====================================================================
--
--  WHY THIS EXISTS
--  Spare Parts and Repair are PEER units, each with a complete P&L.
--  Some costs belong to neither: shop rent, electricity, the owner's
--  cash withdrawals, the shared bike. Forcing these onto one unit
--  distorts that unit's profit; leaving them null makes them vanish
--  from both. Neither is acceptable.
--
--  SOLUTION
--  A third allocation target, SHARED, plus an explicit allocation
--  policy per expense category. Unit P&L is reported at two levels:
--     Direct margin   = unit revenue - unit direct costs
--     Net margin      = direct margin - allocated share of overhead
--
--  The owner sees both. Direct margin is a fact; net margin depends on
--  an allocation rule and should always be labelled as an estimate.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. THE SHARED UNIT
-- ---------------------------------------------------------------------
-- Seeded as a third row in business_unit with code 'SHARED'.
-- owns_stock = 0, earns_labour = 0.

ALTER TABLE business_unit ADD COLUMN is_overhead INTEGER NOT NULL DEFAULT 0;


-- ---------------------------------------------------------------------
-- 2. ALLOCATION POLICY
-- ---------------------------------------------------------------------

ALTER TABLE expense_category ADD COLUMN allocation_method TEXT NOT NULL DEFAULT 'direct';
    -- direct        -> expense names its own unit, no allocation
    -- shared_revenue-> split between units in proportion to revenue
    -- shared_fixed  -> split by a fixed percentage (see below)
    -- not_expense   -> owner drawings; excluded from P&L entirely

ALTER TABLE expense_category ADD COLUMN parts_share_bp INTEGER;
    -- basis points to Spare Parts when method = 'shared_fixed'.
    -- 6000 = 60% Parts / 40% Repair. NULL otherwise.

-- Overhead expenses point at the SHARED unit; allocation happens at
-- REPORT time, never by writing split rows. Splitting on write means a
-- changed policy cannot be applied retrospectively.


-- ---------------------------------------------------------------------
-- 3. DIRECT COST TAGGING
-- ---------------------------------------------------------------------
-- Technician wages are a Repair direct cost. Counter salesman wages are
-- a Spare Parts direct cost. The shop guard is SHARED.

ALTER TABLE attendance ADD COLUMN business_unit_id TEXT REFERENCES business_unit(id);
ALTER TABLE payment    ADD COLUMN business_unit_id TEXT REFERENCES business_unit(id);


-- ---------------------------------------------------------------------
-- 4. REPORTING VIEWS
-- ---------------------------------------------------------------------

-- Revenue and direct cost of goods, per unit, per day.
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

-- Expenses split into direct (named a real unit) and overhead (SHARED).
DROP VIEW IF EXISTS v_unit_direct_expense;
CREATE VIEW v_unit_direct_expense AS
SELECT  e.tenant_id,
        e.expense_date,
        bu.code                     AS unit_code,
        SUM(e.amount)               AS expense_paisa
FROM        expense e
JOIN        business_unit bu    ON bu.id = e.business_unit_id
JOIN        expense_category ec ON ec.id = e.category_id
WHERE       ec.is_owner_drawing = 0
  AND       bu.is_overhead = 0
GROUP BY    e.tenant_id, e.expense_date, bu.code;

DROP VIEW IF EXISTS v_overhead_pool;
CREATE VIEW v_overhead_pool AS
SELECT  e.tenant_id,
        e.expense_date,
        ec.allocation_method,
        ec.parts_share_bp,
        SUM(e.amount)               AS overhead_paisa
FROM        expense e
JOIN        expense_category ec ON ec.id = e.category_id
LEFT JOIN   business_unit bu    ON bu.id = e.business_unit_id
WHERE       ec.is_owner_drawing = 0
  AND       (bu.is_overhead = 1 OR e.business_unit_id IS NULL)
GROUP BY    e.tenant_id, e.expense_date, ec.allocation_method, ec.parts_share_bp;

-- Direct margin per unit. This is FACT - no allocation assumptions.
-- Show this to the owner as the primary number.
DROP VIEW IF EXISTS v_unit_direct_margin;
CREATE VIEW v_unit_direct_margin AS
SELECT  r.tenant_id,
        r.sale_date,
        r.unit_code,
        r.revenue_paisa,
        r.cogs_paisa,
        COALESCE(x.expense_paisa, 0)                                AS direct_expense_paisa,
        r.revenue_paisa - r.cogs_paisa - COALESCE(x.expense_paisa, 0)
                                                                    AS direct_margin_paisa
FROM        v_unit_revenue r
LEFT JOIN   v_unit_direct_expense x
        ON  x.tenant_id = r.tenant_id
       AND  x.expense_date = r.sale_date
       AND  x.unit_code = r.unit_code;

-- Owner drawings are NOT an expense. Reported separately so profit is real.
DROP VIEW IF EXISTS v_owner_drawings;
CREATE VIEW v_owner_drawings AS
SELECT  e.tenant_id,
        e.expense_date,
        SUM(e.amount)   AS drawings_paisa
FROM        expense e
JOIN        expense_category ec ON ec.id = e.category_id
WHERE       ec.is_owner_drawing = 1
GROUP BY    e.tenant_id, e.expense_date;


-- ---------------------------------------------------------------------
-- 5. SEED
-- ---------------------------------------------------------------------
-- Run once, in application code, with generated UUIDs:
--
--   business_unit: PARTS  (owns_stock=1, earns_labour=0, is_overhead=0)
--   business_unit: REPAIR (owns_stock=0, earns_labour=1, is_overhead=0)
--   business_unit: SHARED (owns_stock=0, earns_labour=0, is_overhead=1)
--
-- Suggested category defaults (confirm with the owner):
--   Shop Rent, Electricity, Phone/Internet, Shop Maintenance -> SHARED, shared_revenue
--   Bike Fuel, Vehicle Repair                                -> SHARED, shared_fixed 3000bp
--   Car/Pickup Fuel, Packaging, Delivery                     -> PARTS,  direct
--   Staff Meals                                              -> SHARED, shared_revenue
--   Tools Purchase                                           -> REPAIR, direct
--   Owner Drawings                                           -> not_expense
