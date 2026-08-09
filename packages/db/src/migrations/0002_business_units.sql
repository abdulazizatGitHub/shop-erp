-- =====================================================================
--  ADDENDUM 01 - BUSINESS UNIT SEPARATION
--  Apply AFTER schema.sql.  Migration version 2.
-- =====================================================================
--
--  PURPOSE
--  The client runs two units that trade with each other:
--     Spare Parts  - owns all stock, earns margin on parts
--     Repair       - earns labour income, consumes parts, pays technicians
--
--  DESIGN DECISION (important - read before changing)
--  Revenue is separated by TAGGING EACH INVOICE LINE with a business
--  unit. There is NO internal sale document for billed work.
--     Parts line   -> revenue and COGS land in Spare Parts
--     Labour line  -> revenue lands in Repair
--  This answers "how much was parts, how much was labour" directly,
--  from one invoice, with no intercompany reconciliation.
--
--  THE ONE EXCEPTION
--  When parts are consumed with NO customer invoice (free Dawlance
--  installation, warranty rework, shop's own use), there is no revenue
--  line to tag. Those cases post an internal_transfer row so the Spare
--  Parts unit is credited and the Repair unit carries the cost.
--  Everything else must NOT create an internal transfer.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. BUSINESS UNITS
-- ---------------------------------------------------------------------

CREATE TABLE business_unit (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenant(id),
    code                TEXT NOT NULL,          -- 'PARTS' | 'REPAIR'
    name                TEXT NOT NULL,
    owns_stock          INTEGER NOT NULL DEFAULT 0,
    earns_labour        INTEGER NOT NULL DEFAULT 0,
    is_active           INTEGER NOT NULL DEFAULT 1,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL,
    UNIQUE (tenant_id, code)
);

-- Every item belongs to a unit. Goods -> PARTS. Service lines -> REPAIR.
ALTER TABLE item             ADD COLUMN business_unit_id TEXT REFERENCES business_unit(id);

-- Every revenue line is tagged. THIS is what produces the separation.
ALTER TABLE sale_line        ADD COLUMN business_unit_id TEXT REFERENCES business_unit(id);
ALTER TABLE sale_line        ADD COLUMN line_kind        TEXT NOT NULL DEFAULT 'part';
    -- part | labour | delivery | other
ALTER TABLE sale_line        ADD COLUMN job_part_id      TEXT;  -- links back to job consumption

-- Costs are tagged too, otherwise unit profit is revenue-only.
ALTER TABLE expense          ADD COLUMN business_unit_id TEXT REFERENCES business_unit(id);
ALTER TABLE purchase         ADD COLUMN business_unit_id TEXT REFERENCES business_unit(id);
ALTER TABLE stock_movement   ADD COLUMN business_unit_id TEXT REFERENCES business_unit(id);
    -- which unit CAUSED the movement (a job_issue is caused by REPAIR)
ALTER TABLE party            ADD COLUMN business_unit_id TEXT REFERENCES business_unit(id);
    -- staff belong to a unit: technicians -> REPAIR, salesman -> PARTS


-- ---------------------------------------------------------------------
-- 2. TECHNICIAN CUSTODY
-- ---------------------------------------------------------------------
-- A technician holding material is modelled as a WAREHOUSE, not a debt.
--   Shop -> Naeem        = transfer_out / transfer_in
--   Naeem -> Job #412    = job_issue
--   Naeem -> Shop        = transfer back (unused material)
-- Whatever remains in his warehouse is what he still physically holds.

ALTER TABLE warehouse ADD COLUMN warehouse_kind TEXT NOT NULL DEFAULT 'fixed';
    -- fixed | technician | vehicle
ALTER TABLE warehouse ADD COLUMN custodian_party_id TEXT REFERENCES party(id);

-- Weekly reconciliation of what a technician holds vs what he should.
-- Only create a party_ledger entry against him if the OWNER decides a
-- shortage is a wage deduction. That is a policy choice, not automatic.
CREATE TABLE custody_reconciliation (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenant(id),
    warehouse_id        TEXT NOT NULL REFERENCES warehouse(id),
    custodian_party_id  TEXT NOT NULL REFERENCES party(id),
    reconciled_on       TEXT NOT NULL,
    shortage_value      INTEGER NOT NULL DEFAULT 0,   -- paisa
    action_taken        TEXT NOT NULL DEFAULT 'noted',-- noted | written_off | wage_deduction
    ledger_entry_id     TEXT REFERENCES party_ledger(id),
    notes               TEXT,
    created_at          TEXT NOT NULL,
    created_by          TEXT REFERENCES app_user(id)
);


-- ---------------------------------------------------------------------
-- 3. INTERNAL TRANSFER  (unbilled consumption only)
-- ---------------------------------------------------------------------

CREATE TABLE internal_transfer (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenant(id),
    doc_no              TEXT NOT NULL,
    transfer_date       TEXT NOT NULL,
    from_unit_id        TEXT NOT NULL REFERENCES business_unit(id),
    to_unit_id          TEXT NOT NULL REFERENCES business_unit(id),
    reason              TEXT NOT NULL,
        -- free_installation | warranty_rework | shop_own_use | sample | other
    job_id              TEXT REFERENCES job(id),
    valuation_method    TEXT NOT NULL DEFAULT 'cost',  -- cost | retail | wholesale
    total_amount        INTEGER NOT NULL DEFAULT 0,
    notes               TEXT,
    created_at          TEXT NOT NULL,
    created_by          TEXT REFERENCES app_user(id),
    UNIQUE (tenant_id, doc_no)
);

CREATE TABLE internal_transfer_line (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenant(id),
    transfer_id         TEXT NOT NULL REFERENCES internal_transfer(id),
    item_id             TEXT NOT NULL REFERENCES item(id),
    quantity            INTEGER NOT NULL,   -- milli-units
    unit_value          INTEGER NOT NULL,   -- paisa
    line_total          INTEGER NOT NULL
);


-- ---------------------------------------------------------------------
-- 4. THIRD-PARTY PAYER  (Dawlance contract)
-- ---------------------------------------------------------------------
-- The person receiving the service is not always the person paying.
-- customer_id  = whose fridge it is
-- bill_to_id   = who actually pays (Dawlance, or the customer)

ALTER TABLE job ADD COLUMN business_unit_id  TEXT REFERENCES business_unit(id);
ALTER TABLE job ADD COLUMN bill_to_party_id  TEXT REFERENCES party(id);
ALTER TABLE job ADD COLUMN revenue_type      TEXT NOT NULL DEFAULT 'customer_paid';
    -- customer_paid | warranty_claim | free_installation | contract | internal
ALTER TABLE job ADD COLUMN contract_id       TEXT;
ALTER TABLE job ADD COLUMN claim_reference   TEXT;   -- company job/claim number
ALTER TABLE job ADD COLUMN claim_status      TEXT;   -- pending | submitted | approved | paid | rejected

ALTER TABLE job_part ADD COLUMN business_unit_id TEXT REFERENCES business_unit(id);
ALTER TABLE job_part ADD COLUMN is_billable      INTEGER NOT NULL DEFAULT 1;
    -- 0 when the part is consumed under warranty / free installation

CREATE TABLE service_contract (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenant(id),
    principal_party_id  TEXT NOT NULL REFERENCES party(id),  -- Dawlance
    name                TEXT NOT NULL,
    start_date          TEXT,
    end_date            TEXT,
    covers_warranty_repair    INTEGER NOT NULL DEFAULT 0,
    covers_free_installation  INTEGER NOT NULL DEFAULT 0,
    parts_supplied_by   TEXT NOT NULL DEFAULT 'principal', -- principal | us
    labour_rate         INTEGER,            -- paisa paid to us per job
    notes               TEXT,
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL
);

-- Batched claims sent to the principal for payment.
CREATE TABLE contract_claim (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenant(id),
    contract_id         TEXT NOT NULL REFERENCES service_contract(id),
    doc_no              TEXT NOT NULL,
    period_from         TEXT NOT NULL,
    period_to           TEXT NOT NULL,
    job_count           INTEGER NOT NULL DEFAULT 0,
    claim_amount        INTEGER NOT NULL DEFAULT 0,
    submitted_at        TEXT,
    approved_amount     INTEGER,
    paid_at             TEXT,
    status              TEXT NOT NULL DEFAULT 'draft',
    notes               TEXT,
    UNIQUE (tenant_id, doc_no)
);

CREATE TABLE contract_claim_job (
    claim_id    TEXT NOT NULL REFERENCES contract_claim(id),
    job_id      TEXT NOT NULL REFERENCES job(id),
    amount      INTEGER NOT NULL,
    PRIMARY KEY (claim_id, job_id)
);


-- ---------------------------------------------------------------------
-- 5. SERVICE / LABOUR RATE CARD
-- ---------------------------------------------------------------------
-- Kept separate from `item` so the Items tab stays purely physical goods.

CREATE TABLE service_charge (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenant(id),
    business_unit_id    TEXT NOT NULL REFERENCES business_unit(id),
    name                TEXT NOT NULL,
    job_type            TEXT,               -- AC Installation | AC Service | ...
    retail_charge       INTEGER NOT NULL,   -- paisa
    wholesale_charge    INTEGER,
    commission_amount   INTEGER,            -- paisa, fixed
    commission_bp       INTEGER,            -- OR basis points of the charge
    typical_minutes     INTEGER,
    is_active           INTEGER NOT NULL DEFAULT 1,
    notes               TEXT,
    created_at          TEXT NOT NULL,
    UNIQUE (tenant_id, name)
);


-- ---------------------------------------------------------------------
-- 6. REPORTING VIEWS - the whole point of the exercise
-- ---------------------------------------------------------------------

-- Per-unit revenue, cost and gross margin from billed work.
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

-- One repair job, split into "what came from the parts shop" vs
-- "what the repair shop earned". This is the report they asked for.
DROP VIEW IF EXISTS v_job_split;
CREATE VIEW v_job_split AS
SELECT  j.tenant_id,
        j.id                                                    AS job_id,
        j.doc_no,
        j.received_date,
        j.job_type,
        j.revenue_type,
        j.status,
        p.name                                                  AS customer_name,
        bp.name                                                 AS billed_to_name,
        t.name                                                  AS technician_name,
        COALESCE(parts.parts_charged, 0)                        AS parts_charged_paisa,
        COALESCE(parts.parts_cost, 0)                           AS parts_cost_paisa,
        COALESCE(parts.parts_charged, 0) - COALESCE(parts.parts_cost, 0)
                                                                AS parts_margin_paisa,
        j.labour_charge                                         AS labour_charge_paisa,
        COALESCE(parts.parts_charged, 0) + j.labour_charge      AS total_bill_paisa
FROM        job j
LEFT JOIN   party p  ON p.id  = j.customer_id
LEFT JOIN   party bp ON bp.id = j.bill_to_party_id
LEFT JOIN   party t  ON t.id  = j.assigned_to
LEFT JOIN (
        SELECT  jp.job_id,
                SUM(CASE WHEN jp.is_billable = 1
                         THEN jp.unit_price * jp.quantity / 1000 ELSE 0 END) AS parts_charged,
                SUM(jp.unit_cost * jp.quantity / 1000)                       AS parts_cost
        FROM    job_part jp
        WHERE   jp.is_returned = 0
        GROUP BY jp.job_id
) parts ON parts.job_id = j.id;

-- What each technician is currently holding and has not accounted for.
DROP VIEW IF EXISTS v_technician_custody;
CREATE VIEW v_technician_custody AS
SELECT  w.tenant_id,
        w.custodian_party_id,
        pt.name                             AS technician_name,
        sm.item_id,
        i.name_en                           AS item_name,
        SUM(sm.quantity) / 1000.0           AS qty_held,
        MAX(sm.movement_date)               AS last_movement
FROM        stock_movement sm
JOIN        warehouse w  ON w.id  = sm.warehouse_id
JOIN        item i       ON i.id  = sm.item_id
LEFT JOIN   party pt     ON pt.id = w.custodian_party_id
WHERE       w.warehouse_kind = 'technician'
GROUP BY    w.tenant_id, w.custodian_party_id, sm.item_id
HAVING      SUM(sm.quantity) <> 0;
