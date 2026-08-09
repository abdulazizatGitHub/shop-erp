-- =====================================================================
--  SHOP MANAGEMENT SYSTEM - CORE SCHEMA (SQLite)
--  Target: AC / Fridge / Oven repair + spare parts shop
--  Version: 0.1  (foundation - Phase 1)
-- =====================================================================
--
--  CONVENTIONS - read these before changing anything
--
--  1. MONEY IS STORED AS INTEGER PAISA. Never REAL, never FLOAT.
--     Rs 34,500.50  ->  3450050
--     Divide by 100 only at the moment of display.
--     Floating point money WILL produce balances that are off by
--     0.01 and you will never find the bug.
--
--  2. QUANTITY IS STORED AS INTEGER IN MILLI-UNITS (qty * 1000).
--     34.5 kg -> 34500.  Same reason as above.
--
--  3. PRIMARY KEYS ARE TEXT UUIDs generated in the application
--     (UUIDv7 preferred - it sorts by time). Never AUTOINCREMENT.
--     This is what makes multi-device sync possible later.
--
--  4. tenant_id IS ON EVERY TABLE. In a local single-shop install it
--     is a constant. It costs nothing now and saves a full migration
--     when cloud/multi-tenant arrives.
--
--  5. STOCK AND LEDGER ARE APPEND-ONLY.
--     Never UPDATE a quantity or a balance. Insert a movement row.
--     Corrections are new reversing rows, never edits.
--     Current stock / balance = SUM of rows (cache later if needed).
--
--  6. DATES are TEXT in ISO format 'YYYY-MM-DD' or
--     'YYYY-MM-DDTHH:MM:SSZ' (UTC). SQLite has no date type.
--
--  7. Every table carries created_at / updated_at / created_by and a
--     soft-delete flag. Nothing is ever hard-deleted.
--
--  PRAGMAs to set on every connection:
--     PRAGMA journal_mode = WAL;
--     PRAGMA foreign_keys = ON;
--     PRAGMA synchronous = FULL;   -- power cuts are the main risk
--     PRAGMA busy_timeout = 5000;
-- =====================================================================


-- ---------------------------------------------------------------------
-- SECTION 1: TENANT, USERS, SETTINGS
-- ---------------------------------------------------------------------

CREATE TABLE tenant (
    id                  TEXT PRIMARY KEY,
    business_name       TEXT NOT NULL,
    business_type       TEXT NOT NULL DEFAULT 'repair_and_parts',
    address             TEXT,
    phone               TEXT,
    ntn                 TEXT,              -- FBR National Tax Number (future)
    strn                TEXT,              -- Sales Tax Registration No (future)
    is_tax_registered   INTEGER NOT NULL DEFAULT 0,
    default_currency    TEXT NOT NULL DEFAULT 'PKR',
    financial_year_start_month INTEGER NOT NULL DEFAULT 7,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

CREATE TABLE app_user (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    username        TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    password_hash   TEXT NOT NULL,          -- argon2id
    role            TEXT NOT NULL,          -- owner | manager | salesman | technician
    is_active       INTEGER NOT NULL DEFAULT 1,
    last_login_at   TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    deleted_at      TEXT,
    UNIQUE (tenant_id, username)
);

-- Permissions kept as simple grants, NOT a metadata engine.
-- role -> permission is defined in application code; this table only
-- records per-user overrides. Resist the urge to make this generic.
CREATE TABLE user_permission_override (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenant(id),
    user_id     TEXT NOT NULL REFERENCES app_user(id),
    permission  TEXT NOT NULL,              -- e.g. 'sale.give_discount'
    granted     INTEGER NOT NULL,           -- 1 = allow, 0 = deny
    created_at  TEXT NOT NULL,
    UNIQUE (user_id, permission)
);

CREATE TABLE setting (
    tenant_id   TEXT NOT NULL REFERENCES tenant(id),
    key         TEXT NOT NULL,
    value       TEXT,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (tenant_id, key)
);

-- Human-readable document numbers (INV-000123). Kept separate from PKs.
CREATE TABLE document_sequence (
    tenant_id     TEXT NOT NULL REFERENCES tenant(id),
    doc_type      TEXT NOT NULL,            -- sale | purchase | payment | job | expense
    prefix        TEXT NOT NULL,
    device_code   TEXT NOT NULL DEFAULT 'A',-- prevents collisions across devices later
    next_number   INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (tenant_id, doc_type, device_code)
);


-- ---------------------------------------------------------------------
-- SECTION 2: ITEM MASTER
-- ---------------------------------------------------------------------
-- NOTE: deliberately NO product/variant matrix. At 300-500 SKUs a flat
-- item list with category + brand + variant_label gives all the grouping
-- benefit at none of the complexity cost.

CREATE TABLE category (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenant(id),
    name        TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    deleted_at  TEXT,
    UNIQUE (tenant_id, name)
);

CREATE TABLE brand (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenant(id),
    name        TEXT NOT NULL,
    deleted_at  TEXT,
    UNIQUE (tenant_id, name)
);

CREATE TABLE uom (                          -- unit of measure
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenant(id),
    name        TEXT NOT NULL,              -- Piece, Kg, Foot, Cylinder
    allow_fraction INTEGER NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, name)
);

CREATE TABLE item (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenant(id),
    item_code           TEXT NOT NULL,
    name_en             TEXT NOT NULL,
    name_ur             TEXT,
    category_id         TEXT REFERENCES category(id),
    brand_id            TEXT REFERENCES brand(id),
    variant_label       TEXT,               -- '1.5 Ton R-410A', '11.3 kg'

    -- Units. purchase_uom may differ from stock/selling uom.
    -- e.g. buy 1 Cylinder, stock and sell in Kg, factor = 11300 (11.3 * 1000)
    stock_uom_id        TEXT NOT NULL REFERENCES uom(id),
    purchase_uom_id     TEXT REFERENCES uom(id),
    purchase_to_stock_factor INTEGER NOT NULL DEFAULT 1000,  -- milli-units

    item_type           TEXT NOT NULL DEFAULT 'goods',  -- goods | service
    track_stock         INTEGER NOT NULL DEFAULT 1,
    is_serialized       INTEGER NOT NULL DEFAULT 0,
    is_returnable_container INTEGER NOT NULL DEFAULT 0,  -- empty gas cylinders

    last_purchase_cost  INTEGER,            -- paisa per stock unit
    avg_cost            INTEGER,            -- paisa, weighted average
    reorder_level       INTEGER,            -- milli-units
    shelf_location      TEXT,

    default_tax_rate    INTEGER NOT NULL DEFAULT 0,  -- basis points. 1700 = 17%
    is_active           INTEGER NOT NULL DEFAULT 1,
    notes               TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    deleted_at          TEXT,
    UNIQUE (tenant_id, item_code)
);
CREATE INDEX idx_item_name    ON item (tenant_id, name_en);
CREATE INDEX idx_item_cat     ON item (tenant_id, category_id);

CREATE TABLE item_barcode (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenant(id),
    item_id     TEXT NOT NULL REFERENCES item(id),
    barcode     TEXT NOT NULL,
    UNIQUE (tenant_id, barcode)
);

-- Price levels: Retail, Wholesale, and any future tier (VIP, Staff).
-- Adding a tier = one row here, not a schema change.
CREATE TABLE price_level (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    name            TEXT NOT NULL,          -- 'Retail', 'Wholesale'
    is_default      INTEGER NOT NULL DEFAULT 0,
    -- Optional rule-based pricing: if margin_bp is set and item_price has
    -- no explicit row, price = cost * (1 + margin_bp/10000)
    margin_bp       INTEGER,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, name)
);

CREATE TABLE item_price (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    item_id         TEXT NOT NULL REFERENCES item(id),
    price_level_id  TEXT NOT NULL REFERENCES price_level(id),
    price           INTEGER NOT NULL,       -- paisa per stock unit
    effective_from  TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    UNIQUE (item_id, price_level_id, effective_from)
);

-- Serial numbers for compressors, PCBs etc.
CREATE TABLE item_serial (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    item_id         TEXT NOT NULL REFERENCES item(id),
    serial_no       TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'in_stock', -- in_stock|sold|installed|returned|scrapped
    purchase_line_id TEXT,
    sale_line_id    TEXT,
    job_id          TEXT,
    warranty_until  TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    UNIQUE (tenant_id, item_id, serial_no)
);


-- ---------------------------------------------------------------------
-- SECTION 3: PARTIES  (customers, suppliers, staff - ONE table)
-- ---------------------------------------------------------------------
-- Customer udhaar, supplier payables and staff peshgi are structurally
-- identical: a party with a running balance. Model once.

CREATE TABLE party (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenant(id),
    party_code          TEXT NOT NULL,
    party_type          TEXT NOT NULL,      -- customer | supplier | both | staff
    name                TEXT NOT NULL,
    shop_name           TEXT,               -- wholesale customers
    phone               TEXT,
    phone_alt           TEXT,
    cnic                TEXT,
    address             TEXT,
    city_area           TEXT,

    -- customer-specific
    customer_type       TEXT,               -- retail | wholesale
    price_level_id      TEXT REFERENCES price_level(id),
    credit_limit        INTEGER,            -- paisa, NULL = unlimited

    -- staff-specific
    staff_role          TEXT,               -- technician | helper | salesman
    wage_type           TEXT,               -- daily | monthly | per_job
    wage_rate           INTEGER,            -- paisa
    commission_bp       INTEGER,            -- basis points of labour
    join_date           TEXT,

    opening_balance     INTEGER NOT NULL DEFAULT 0,  -- +ve = they owe us
    opening_balance_date TEXT,
    is_active           INTEGER NOT NULL DEFAULT 1,
    notes               TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    deleted_at          TEXT,
    UNIQUE (tenant_id, party_code)
);
CREATE INDEX idx_party_name  ON party (tenant_id, name);
CREATE INDEX idx_party_phone ON party (tenant_id, phone);
CREATE INDEX idx_party_type  ON party (tenant_id, party_type);

-- APPEND-ONLY ledger. Never update. Balance = SUM(amount).
-- Sign convention:  +ve = party owes US more (sale, advance given)
--                   -ve = party owes US less (payment received, purchase)
CREATE TABLE party_ledger (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    party_id        TEXT NOT NULL REFERENCES party(id),
    entry_date      TEXT NOT NULL,
    entry_type      TEXT NOT NULL,
        -- opening_balance | sale | sale_return | payment_received
        -- purchase | purchase_return | payment_made
        -- staff_advance | staff_wage | staff_wage_paid
        -- adjustment | write_off
    amount          INTEGER NOT NULL,       -- paisa, signed
    running_note    TEXT,
    source_type     TEXT,                   -- 'sale' | 'purchase' | 'payment' | ...
    source_id       TEXT,                   -- id of the source document
    reversed_by_id  TEXT REFERENCES party_ledger(id),  -- corrections
    created_at      TEXT NOT NULL,
    created_by      TEXT REFERENCES app_user(id)
);
CREATE INDEX idx_ledger_party ON party_ledger (tenant_id, party_id, entry_date);
CREATE INDEX idx_ledger_src   ON party_ledger (source_type, source_id);


-- ---------------------------------------------------------------------
-- SECTION 4: STOCK  (append-only movements)
-- ---------------------------------------------------------------------

CREATE TABLE warehouse (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenant(id),
    name        TEXT NOT NULL,              -- 'Shop', 'Store Room', 'Van'
    is_default  INTEGER NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, name)
);

-- THE most important table in the system. NEVER UPDATE A ROW HERE.
CREATE TABLE stock_movement (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    item_id         TEXT NOT NULL REFERENCES item(id),
    warehouse_id    TEXT NOT NULL REFERENCES warehouse(id),
    movement_date   TEXT NOT NULL,
    movement_type   TEXT NOT NULL,
        -- opening | purchase | purchase_return | sale | sale_return
        -- job_issue        (part consumed on an internal repair job)
        -- job_return       (part taken but not used, returned to stock)
        -- adjustment_in | adjustment_out | damage | transfer_in | transfer_out
    quantity        INTEGER NOT NULL,       -- milli-units, SIGNED (+in / -out)
    unit_cost       INTEGER,                -- paisa per stock unit at time of movement
    serial_id       TEXT REFERENCES item_serial(id),
    source_type     TEXT,
    source_id       TEXT,
    reason          TEXT,                   -- required for adjustments/damage
    reversed_by_id  TEXT REFERENCES stock_movement(id),
    created_at      TEXT NOT NULL,
    created_by      TEXT REFERENCES app_user(id)
);
CREATE INDEX idx_sm_item ON stock_movement (tenant_id, item_id, movement_date);
CREATE INDEX idx_sm_src  ON stock_movement (source_type, source_id);

-- Optional cache. Rebuildable from stock_movement at any time.
-- Do NOT treat as the source of truth.
CREATE TABLE stock_balance_cache (
    tenant_id       TEXT NOT NULL,
    item_id         TEXT NOT NULL,
    warehouse_id    TEXT NOT NULL,
    quantity        INTEGER NOT NULL,
    last_movement_at TEXT,
    PRIMARY KEY (tenant_id, item_id, warehouse_id)
);


-- ---------------------------------------------------------------------
-- SECTION 5: PURCHASES
-- ---------------------------------------------------------------------

CREATE TABLE purchase (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenant(id),
    doc_no              TEXT NOT NULL,
    supplier_id         TEXT NOT NULL REFERENCES party(id),
    warehouse_id        TEXT NOT NULL REFERENCES warehouse(id),
    purchase_date       TEXT NOT NULL,
    supplier_invoice_no TEXT,
    subtotal            INTEGER NOT NULL DEFAULT 0,
    discount_amount     INTEGER NOT NULL DEFAULT 0,
    freight_amount      INTEGER NOT NULL DEFAULT 0,
    tax_amount          INTEGER NOT NULL DEFAULT 0,
    total_amount        INTEGER NOT NULL DEFAULT 0,
    paid_amount         INTEGER NOT NULL DEFAULT 0,
    payment_mode        TEXT,               -- cash | credit | bank | easypaisa | jazzcash
    status              TEXT NOT NULL DEFAULT 'confirmed', -- draft|confirmed|cancelled
    notes               TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    created_by          TEXT REFERENCES app_user(id),
    UNIQUE (tenant_id, doc_no)
);

CREATE TABLE purchase_line (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    purchase_id     TEXT NOT NULL REFERENCES purchase(id),
    line_no         INTEGER NOT NULL,
    item_id         TEXT NOT NULL REFERENCES item(id),
    quantity        INTEGER NOT NULL,       -- milli-units, in purchase uom
    stock_quantity  INTEGER NOT NULL,       -- milli-units, converted to stock uom
    unit_cost       INTEGER NOT NULL,       -- paisa
    discount_amount INTEGER NOT NULL DEFAULT 0,
    tax_rate        INTEGER NOT NULL DEFAULT 0,
    tax_amount      INTEGER NOT NULL DEFAULT 0,
    line_total      INTEGER NOT NULL,
    notes           TEXT
);
CREATE INDEX idx_pl_purchase ON purchase_line (purchase_id);


-- ---------------------------------------------------------------------
-- SECTION 6: SALES
-- ---------------------------------------------------------------------

CREATE TABLE sale (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenant(id),
    doc_no              TEXT NOT NULL,
    customer_id         TEXT REFERENCES party(id),   -- NULL = walk-in cash
    customer_name_adhoc TEXT,               -- walk-in name without creating a party
    warehouse_id        TEXT NOT NULL REFERENCES warehouse(id),
    price_level_id      TEXT NOT NULL REFERENCES price_level(id),
    sale_date           TEXT NOT NULL,
    sale_type           TEXT NOT NULL DEFAULT 'counter', -- counter | job | delivery

    subtotal            INTEGER NOT NULL DEFAULT 0,
    discount_amount     INTEGER NOT NULL DEFAULT 0,
    delivery_charge     INTEGER NOT NULL DEFAULT 0,   -- charged TO customer
    labour_charge       INTEGER NOT NULL DEFAULT 0,
    tax_amount          INTEGER NOT NULL DEFAULT 0,
    total_amount        INTEGER NOT NULL DEFAULT 0,
    paid_amount         INTEGER NOT NULL DEFAULT 0,
    -- balance_due is derived: total_amount - paid_amount. Do not store.
    payment_mode        TEXT,               -- cash | credit | bank | easypaisa | jazzcash | mixed
    status              TEXT NOT NULL DEFAULT 'confirmed', -- draft|confirmed|cancelled

    -- FBR seam. Unused until the shop registers. Costs nothing now.
    is_fiscal           INTEGER NOT NULL DEFAULT 0,
    fbr_invoice_no      TEXT,
    fbr_status          TEXT,               -- pending | submitted | failed
    fbr_submitted_at    TEXT,

    job_id              TEXT,               -- link to repair job (Phase 2)
    notes               TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    created_by          TEXT REFERENCES app_user(id),
    UNIQUE (tenant_id, doc_no)
);
CREATE INDEX idx_sale_date ON sale (tenant_id, sale_date);
CREATE INDEX idx_sale_cust ON sale (tenant_id, customer_id);

CREATE TABLE sale_line (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    sale_id         TEXT NOT NULL REFERENCES sale(id),
    line_no         INTEGER NOT NULL,
    item_id         TEXT NOT NULL REFERENCES item(id),
    description     TEXT,                   -- snapshot of name at time of sale
    quantity        INTEGER NOT NULL,       -- milli-units
    unit_price      INTEGER NOT NULL,       -- paisa
    unit_cost       INTEGER,                -- paisa, SNAPSHOT for margin reporting
    discount_amount INTEGER NOT NULL DEFAULT 0,
    tax_rate        INTEGER NOT NULL DEFAULT 0,
    tax_amount      INTEGER NOT NULL DEFAULT 0,
    line_total      INTEGER NOT NULL,
    serial_id       TEXT REFERENCES item_serial(id),
    warranty_months INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sl_sale ON sale_line (sale_id);
CREATE INDEX idx_sl_item ON sale_line (tenant_id, item_id);


-- ---------------------------------------------------------------------
-- SECTION 7: PAYMENTS  (in and out)
-- ---------------------------------------------------------------------

CREATE TABLE payment (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    doc_no          TEXT NOT NULL,
    direction       TEXT NOT NULL,          -- in (received) | out (paid)
    party_id        TEXT NOT NULL REFERENCES party(id),
    payment_date    TEXT NOT NULL,
    amount          INTEGER NOT NULL,       -- paisa, always positive
    method          TEXT NOT NULL,          -- cash | bank | easypaisa | jazzcash | cheque
    reference_no    TEXT,                   -- cheque no / txn id
    cheque_date     TEXT,                   -- post-dated cheque tracking
    cheque_status   TEXT,                   -- pending | cleared | bounced
    notes           TEXT,
    created_at      TEXT NOT NULL,
    created_by      TEXT REFERENCES app_user(id),
    UNIQUE (tenant_id, doc_no)
);

-- Optional allocation of a payment against specific bills (for aging).
CREATE TABLE payment_allocation (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    payment_id      TEXT NOT NULL REFERENCES payment(id),
    target_type     TEXT NOT NULL,          -- sale | purchase | opening_balance
    target_id       TEXT NOT NULL,
    amount          INTEGER NOT NULL
);


-- ---------------------------------------------------------------------
-- SECTION 8: EXPENSES + CASH BOOK
-- ---------------------------------------------------------------------

CREATE TABLE expense_category (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenant(id),
    name                TEXT NOT NULL,
    kind                TEXT NOT NULL DEFAULT 'variable', -- fixed | variable
    is_billable         INTEGER NOT NULL DEFAULT 0,  -- can be charged to a customer
    is_owner_drawing    INTEGER NOT NULL DEFAULT 0,  -- not a real expense
    sort_order          INTEGER NOT NULL DEFAULT 0,
    deleted_at          TEXT,
    UNIQUE (tenant_id, name)
);

CREATE TABLE expense (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    doc_no          TEXT NOT NULL,
    category_id     TEXT NOT NULL REFERENCES expense_category(id),
    expense_date    TEXT NOT NULL,
    amount          INTEGER NOT NULL,       -- paisa
    paid_to         TEXT,                   -- free text vendor
    party_id        TEXT REFERENCES party(id),  -- if paid to a known party/staff
    method          TEXT NOT NULL DEFAULT 'cash',
    reference_no    TEXT,
    -- if this expense is attributable to a job or a delivery
    job_id          TEXT,
    sale_id         TEXT REFERENCES sale(id),
    vehicle         TEXT,                   -- 'Bike-1', 'Pickup'
    description     TEXT,
    receipt_path    TEXT,                   -- scanned/photo receipt
    created_at      TEXT NOT NULL,
    created_by      TEXT REFERENCES app_user(id),
    UNIQUE (tenant_id, doc_no)
);
CREATE INDEX idx_exp_date ON expense (tenant_id, expense_date);
CREATE INDEX idx_exp_cat  ON expense (tenant_id, category_id);

-- Daily cash reconciliation: what the drawer SHOULD have vs what it does.
CREATE TABLE cash_session (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenant(id),
    session_date        TEXT NOT NULL,
    opened_at           TEXT NOT NULL,
    closed_at           TEXT,
    opening_cash        INTEGER NOT NULL DEFAULT 0,
    expected_cash       INTEGER,            -- computed at close
    counted_cash        INTEGER,            -- what the owner actually counted
    difference          INTEGER,            -- counted - expected
    opened_by           TEXT REFERENCES app_user(id),
    closed_by           TEXT REFERENCES app_user(id),
    notes               TEXT,
    UNIQUE (tenant_id, session_date)
);


-- ---------------------------------------------------------------------
-- SECTION 9: REPAIR JOBS   (Phase 2 - schema included for coherence)
-- ---------------------------------------------------------------------

CREATE TABLE job (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenant(id),
    doc_no              TEXT NOT NULL,
    customer_id         TEXT REFERENCES party(id),
    customer_name_adhoc TEXT,
    customer_phone      TEXT,
    job_type            TEXT NOT NULL,      -- in_shop | on_site | installation
    appliance_type      TEXT,               -- AC | Fridge | Oven | Washing Machine
    appliance_brand     TEXT,
    appliance_model     TEXT,
    appliance_serial    TEXT,
    reported_fault      TEXT,
    accessories_received TEXT,              -- 'remote, stabilizer'
    received_date       TEXT NOT NULL,
    promised_date       TEXT,
    estimate_amount     INTEGER,
    estimate_approved   INTEGER NOT NULL DEFAULT 0,
    assigned_to         TEXT REFERENCES party(id),  -- technician
    status              TEXT NOT NULL DEFAULT 'received',
        -- received | diagnosed | awaiting_approval | awaiting_parts
        -- in_progress | ready | delivered | cancelled
    diagnosis           TEXT,
    work_done           TEXT,
    labour_charge       INTEGER NOT NULL DEFAULT 0,
    parts_cost          INTEGER NOT NULL DEFAULT 0,
    total_charge        INTEGER NOT NULL DEFAULT 0,
    warranty_days       INTEGER NOT NULL DEFAULT 0,
    is_warranty_rework  INTEGER NOT NULL DEFAULT 0,
    parent_job_id       TEXT REFERENCES job(id),    -- original job if rework
    delivered_date      TEXT,
    sale_id             TEXT REFERENCES sale(id),   -- invoice raised on delivery
    notes               TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    created_by          TEXT REFERENCES app_user(id),
    UNIQUE (tenant_id, doc_no)
);
CREATE INDEX idx_job_status ON job (tenant_id, status);
CREATE INDEX idx_job_cust   ON job (tenant_id, customer_id);

-- Parts issued from stock INTO a repair job. This is what makes
-- internal consumption distinguishable from a counter sale.
CREATE TABLE job_part (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    job_id          TEXT NOT NULL REFERENCES job(id),
    item_id         TEXT NOT NULL REFERENCES item(id),
    quantity        INTEGER NOT NULL,       -- milli-units
    unit_cost       INTEGER NOT NULL,       -- paisa, snapshot
    unit_price      INTEGER NOT NULL,       -- paisa, what customer is charged
    serial_id       TEXT REFERENCES item_serial(id),
    is_returned     INTEGER NOT NULL DEFAULT 0,
    issued_at       TEXT NOT NULL,
    issued_by       TEXT REFERENCES app_user(id)
);
CREATE INDEX idx_jp_job ON job_part (job_id);

CREATE TABLE job_status_history (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenant(id),
    job_id      TEXT NOT NULL REFERENCES job(id),
    from_status TEXT,
    to_status   TEXT NOT NULL,
    changed_at  TEXT NOT NULL,
    changed_by  TEXT REFERENCES app_user(id),
    note        TEXT
);


-- ---------------------------------------------------------------------
-- SECTION 10: STAFF ATTENDANCE + WAGES   (Phase 2)
-- ---------------------------------------------------------------------
-- Staff live in `party` with party_type='staff'. Advances and wage
-- liability flow through party_ledger like any other balance.

CREATE TABLE attendance (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    staff_id        TEXT NOT NULL REFERENCES party(id),
    attendance_date TEXT NOT NULL,
    status          TEXT NOT NULL,          -- present | half_day | absent | leave | holiday
    hours_worked    INTEGER,                -- milli-hours, optional
    overtime_hours  INTEGER,
    wage_earned     INTEGER NOT NULL DEFAULT 0,  -- paisa, computed at entry
    note            TEXT,
    created_at      TEXT NOT NULL,
    created_by      TEXT REFERENCES app_user(id),
    UNIQUE (tenant_id, staff_id, attendance_date)
);
CREATE INDEX idx_att_date ON attendance (tenant_id, attendance_date);


-- ---------------------------------------------------------------------
-- SECTION 11: AUDIT + SYNC SEAMS
-- ---------------------------------------------------------------------

CREATE TABLE audit_log (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL,
    table_name      TEXT NOT NULL,
    record_id       TEXT NOT NULL,
    action          TEXT NOT NULL,          -- insert | update | delete
    changed_fields  TEXT,                   -- JSON
    old_values      TEXT,                   -- JSON
    user_id         TEXT,
    device_code     TEXT,
    created_at      TEXT NOT NULL
);
CREATE INDEX idx_audit_rec ON audit_log (table_name, record_id);

-- Outbox for future cloud sync. Populated from day one so that when
-- sync is switched on, history is already there. Costs one insert.
CREATE TABLE sync_outbox (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL,
    table_name      TEXT NOT NULL,
    record_id       TEXT NOT NULL,
    operation       TEXT NOT NULL,
    payload         TEXT,                   -- JSON snapshot
    created_at      TEXT NOT NULL,
    synced_at       TEXT,
    sync_attempts   INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT
);
CREATE INDEX idx_outbox_pending ON sync_outbox (synced_at, created_at);

CREATE TABLE schema_migration (
    version     INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    applied_at  TEXT NOT NULL
);


-- ---------------------------------------------------------------------
-- SECTION 12: HELPER VIEWS
-- ---------------------------------------------------------------------

CREATE VIEW v_stock_on_hand AS
SELECT  sm.tenant_id,
        sm.item_id,
        sm.warehouse_id,
        SUM(sm.quantity)                        AS qty_milli,
        SUM(sm.quantity) / 1000.0               AS qty,
        MAX(sm.movement_date)                   AS last_movement_date
FROM    stock_movement sm
GROUP BY sm.tenant_id, sm.item_id, sm.warehouse_id;

CREATE VIEW v_party_balance AS
SELECT  p.tenant_id,
        p.id                                    AS party_id,
        p.name,
        p.party_type,
        p.phone,
        COALESCE(SUM(pl.amount), 0)             AS balance_paisa,
        COALESCE(SUM(pl.amount), 0) / 100.0      AS balance_pkr,
        MAX(pl.entry_date)                      AS last_activity_date
FROM    party p
LEFT JOIN party_ledger pl ON pl.party_id = p.id
WHERE   p.deleted_at IS NULL
GROUP BY p.tenant_id, p.id;

CREATE VIEW v_daily_sales AS
SELECT  s.tenant_id,
        s.sale_date,
        COUNT(*)                                AS invoice_count,
        SUM(s.total_amount)                     AS total_sales_paisa,
        SUM(s.paid_amount)                      AS cash_collected_paisa,
        SUM(s.total_amount - s.paid_amount)     AS credit_given_paisa
FROM    sale s
WHERE   s.status = 'confirmed'
GROUP BY s.tenant_id, s.sale_date;
