-- =====================================================================
--  ADDENDUM 14 - PURCHASE ORDERS + GOODS RECEIPT NOTES (GRN)
--  Migration version 14.
-- =====================================================================
--
--  WHY THIS EXISTS
--  The existing `purchase` table (Phase 2) collapses ordering and
--  receiving into one instantaneous event: a purchase row is created
--  already status='confirmed', with stock and (if credit) the supplier
--  ledger posted atomically in the same transaction. This migration adds
--  a genuine two-step flow on top, without touching `purchase` at all:
--
--    Step 1 - purchase_order: what was ordered, from whom, in what
--             quantities. No prices. No stock movement. No ledger entry.
--    Step 2 - grn (goods receipt note): what actually arrived, at what
--             cost, against a supplier bill. THIS is where stock moves
--             and the supplier ledger updates. One purchase_order can
--             have multiple grn rows (partial deliveries); a grn_line
--             can be unplanned (purchase_order_line_id NULL) to handle
--             a surprise addition from the supplier.
--
--  `purchase` and `purchase_line` are untouched by this migration and by
--  every future write from this point forward -- they are read-only
--  historical data (PUR-0001, PUR-0002 stay exactly as they are). This
--  phase does not migrate the existing one-step purchase flow to use
--  purchase_order/grn; that is a decision for the future UI session that
--  builds screens on top of this schema.
--
--  No CHECK constraints, per project convention (confirmed by grepping
--  every existing migration -- enums are canonical in application/Zod
--  code, not the DDL comment).
--
--  No BEGIN/COMMIT here: packages/db/src/migration-runner.ts already
--  wraps db.exec(migration.sql) in its own db.transaction() closure --
--  an explicit BEGIN here would fail with "cannot start a transaction
--  within a transaction" (same note as 0013_item_code_reformat.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PURCHASE ORDER
-- ---------------------------------------------------------------------

CREATE TABLE purchase_order (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenant(id),
    doc_no              TEXT NOT NULL,
    supplier_party_id   TEXT REFERENCES party(id),
    supplier_note       TEXT,               -- free text for an unnamed/ad-hoc supplier
    order_date          TEXT NOT NULL,
    expected_delivery   TEXT,
    notes               TEXT,
    status              TEXT NOT NULL DEFAULT 'draft',
        -- draft | sent | partially_received | fully_received | cancelled
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    UNIQUE (tenant_id, doc_no)
);

CREATE TABLE purchase_order_line (
    id                      TEXT PRIMARY KEY,
    tenant_id               TEXT NOT NULL REFERENCES tenant(id),
    purchase_order_id       TEXT NOT NULL REFERENCES purchase_order(id),
    item_id                 TEXT NOT NULL REFERENCES item(id),
    quantity_ordered_milli  INTEGER NOT NULL,   -- milli-units, > 0
    quantity_received_milli INTEGER NOT NULL DEFAULT 0,
        -- running total updated as GRNs are confirmed against this line;
        -- never decremented directly except by grn.cancel's own reversal
    notes                   TEXT
);

CREATE INDEX idx_pol_po ON purchase_order_line (purchase_order_id);

-- ---------------------------------------------------------------------
-- 2. GOODS RECEIPT NOTE (GRN)
-- ---------------------------------------------------------------------

CREATE TABLE grn (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenant(id),
    doc_no              TEXT NOT NULL,
    purchase_order_id   TEXT NOT NULL REFERENCES purchase_order(id),
    supplier_party_id   TEXT REFERENCES party(id),
        -- if set, overrides the PO's supplier for this receipt;
        -- required (on the GRN or inherited from the PO) when
        -- payment_mode = 'credit'
    supplier_bill_ref   TEXT,               -- supplier's own invoice number
    grn_date            TEXT NOT NULL,
    payment_mode        TEXT NOT NULL,      -- cash | credit
    status              TEXT NOT NULL DEFAULT 'confirmed',  -- confirmed | cancelled
    notes               TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    UNIQUE (tenant_id, doc_no)
);

CREATE INDEX idx_grn_po ON grn (purchase_order_id);

CREATE TABLE grn_line (
    id                       TEXT PRIMARY KEY,
    tenant_id                TEXT NOT NULL REFERENCES tenant(id),
    grn_id                   TEXT NOT NULL REFERENCES grn(id),
    purchase_order_line_id   TEXT REFERENCES purchase_order_line(id),
        -- NULL = unplanned receipt, an item not on the original PO
    item_id                  TEXT NOT NULL REFERENCES item(id),
        -- always set directly; never derived from the PO line
    quantity_received_milli  INTEGER NOT NULL,   -- milli-units, > 0
    unit_cost_paisa          INTEGER NOT NULL,   -- from the supplier bill
    selling_price_paisa      INTEGER NOT NULL,   -- retail price, required
    wholesale_price_paisa    INTEGER             -- nullable, optional
);

CREATE INDEX idx_gl_grn ON grn_line (grn_id);
CREATE INDEX idx_gl_pol ON grn_line (purchase_order_line_id);

-- ---------------------------------------------------------------------
-- 3. ITEM PRICE HISTORY
-- ---------------------------------------------------------------------
-- Permanent record of every purchase-cost/retail/wholesale price change
-- a GRN causes. Never rolled back, even when the GRN that caused it is
-- later cancelled (docs/phases/PHASE_9.md -- the cancellation itself is
-- the record that the change was voided, not a reason to erase history).

CREATE TABLE item_price_history (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    item_id         TEXT NOT NULL REFERENCES item(id),
    price_type      TEXT NOT NULL,          -- purchase_cost | retail | wholesale
    old_value_paisa INTEGER NOT NULL,
    new_value_paisa INTEGER NOT NULL,
    changed_at      TEXT NOT NULL,
    source_type     TEXT NOT NULL,          -- 'grn'
    source_id       TEXT NOT NULL           -- grn.id
);

CREATE INDEX idx_iph_item ON item_price_history (item_id);
CREATE INDEX idx_iph_src  ON item_price_history (source_type, source_id);

-- ---------------------------------------------------------------------
-- 4. DOCUMENT NUMBERING
-- ---------------------------------------------------------------------

INSERT OR IGNORE INTO document_sequence
    (tenant_id, doc_type, prefix, device_code, next_number)
VALUES
    ((SELECT id FROM tenant LIMIT 1), 'purchase_order', 'PO', 'A', 1),
    ((SELECT id FROM tenant LIMIT 1), 'grn', 'GRN', 'A', 1);
