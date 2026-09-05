-- =====================================================================
--  ADDENDUM 10 - JOB ADDITIONS (Phase 6)
--  Migration version 10.
-- =====================================================================
--
--  WHY THIS EXISTS
--  Phase 6 (Repair Jobs & the Two-Unit Split). Three real schema gaps
--  found during Phase 6 planning (docs/phases/PHASE_6.md §2/§6), all
--  resolved by explicit owner decision, not invented:
--
--  GAP-3: payer_party_id/revenue_type existed only on `job` (job-level),
--  contradicting ADR-0007's explicit line-level payer design ("Dawlance
--  pays labour, the customer pays extra pipe, on the same job"). Owner
--  decision: one INV per job, payer PER LINE. sale_line gets its own
--  payer_party_id/revenue_type; job.bill_to_party_id/job.revenue_type
--  stay as a default/estimate shown at intake, not the billing source
--  of truth.
--
--  GAP-8: job_part.is_returned was a mutable flag (UPDATE ... SET
--  is_returned = 1), contradicting the append-only rule (CLAUDE.md
--  §3.3) and this phase's own binding constraint that job_part rows
--  are INSERT-only. Owner decision: returns are new rows. is_returned
--  is retired in place (never dropped — DATABASE_RULES.md §4: never
--  edit an applied migration), replaced by entry_type +
--  reverses_job_part_id, set only on the NEW return row — the same
--  forward-pointing pattern BUG-14 established for party_ledger/
--  stock_movement (reversed_by_id exists as a column there too, but is
--  never actually written by any code path).
--
--  GAP-7: job.accessories_received was free text; owner wants catalog
--  items with serial tracking for accessories received at intake — a
--  real scope increase over the pre-existing column, which stays in
--  place, unused/superseded. New job_accessory table. Accessories are
--  CUSTOMER property temporarily in the shop's custody — this table
--  deliberately does NOT touch stock_movement (no stock impact), and
--  serial_no here is the customer's own device serial, distinct from
--  item_serial (which tracks the SHOP's own serialized stock).
--
--  P6-5 delivery invoice needs two more sale_line columns:
--  service_charge_id (GAP-2 — labour lines reference the rate card, not
--  item_id) and a link back to the job_part row a part line consumed.
--  NOTE: sale_line.job_part_id ALREADY EXISTS — added in
--  0002_business_units.sql line 52 ("links back to job consumption"),
--  plain TEXT, no REFERENCES clause. NOT re-added here — doing so would
--  crash every migration run (including every test's beforeEach) with
--  "duplicate column name: job_part_id". Confirmed by direct grep
--  before writing this file, not assumed. Its missing REFERENCES
--  constraint is a pre-existing Phase 2 gap, not retrofitted here —
--  SQLite can't ALTER an existing column to add a constraint without a
--  full table rebuild, too risky to bundle into this migration.
--
--  Also seeds a JOB document_sequence row per (tenant, device_code),
--  mirroring the payment_out/PMT seed pattern from 0006.
--
--  No BEGIN/COMMIT here: packages/db/src/migration-runner.ts already
--  wraps db.exec(migration.sql) in its own db.transaction() closure —
--  an explicit BEGIN here would fail with "cannot start a transaction
--  within a transaction" (confirmed in 0006/0007/0008/0009 and in
--  migration-runner.ts itself, lines 125-126).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LINE-LEVEL PAYER, LABOUR, AND JOB LINKAGE (GAP-2, GAP-3)
-- ---------------------------------------------------------------------

ALTER TABLE sale_line ADD COLUMN payer_party_id TEXT REFERENCES party(id);
ALTER TABLE sale_line ADD COLUMN revenue_type   TEXT NOT NULL DEFAULT 'customer_paid';
    -- customer_paid | contract | warranty | internal
    -- mirrors job.revenue_type's existing vocabulary (0002_business_units.sql)

ALTER TABLE sale_line ADD COLUMN service_charge_id TEXT REFERENCES service_charge(id);
    -- GAP-2: labour lines on a job delivery reference the rate card here.
    -- Nullable — only set on labour lines. Parts lines and ordinary
    -- counter-sale lines leave this NULL.
    -- (job_part_id already exists — see file header note above; not
    -- re-added here.)

-- ---------------------------------------------------------------------
-- 2. JOB_PART APPEND-ONLY RETURNS (GAP-8)
-- ---------------------------------------------------------------------

ALTER TABLE job_part ADD COLUMN entry_type           TEXT NOT NULL DEFAULT 'issue';
    -- issue | return
ALTER TABLE job_part ADD COLUMN reverses_job_part_id TEXT REFERENCES job_part(id);
    -- set ONLY on a new 'return' row, pointing at the 'issue' row it
    -- reverses. is_returned is retired: never read or written by any
    -- code from this migration forward. quantity/unit_cost/unit_price
    -- on a return row are always positive, snapshotting the SAME values
    -- as the issue row it reverses (the view negates them for
    -- aggregation — see v_job_split below).

-- ---------------------------------------------------------------------
-- 3. ACCESSORIES AT INTAKE (GAP-7)
-- ---------------------------------------------------------------------

CREATE TABLE job_accessory (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    job_id          TEXT NOT NULL REFERENCES job(id),
    item_id         TEXT REFERENCES item(id),   -- catalog reference only; not shop stock
    description     TEXT NOT NULL,              -- 'Remote Control' etc, free text fallback
    serial_no       TEXT,                       -- customer's OWN device serial, not item_serial
    condition_notes TEXT,
    returned_at     TEXT,
    created_at      TEXT NOT NULL
);
CREATE INDEX idx_job_accessory_job ON job_accessory (job_id);

-- ---------------------------------------------------------------------
-- 4. JOB DOCUMENT NUMBERING (GAP-1)
-- ---------------------------------------------------------------------
-- Delivery invoice reuses the existing sale/INV-NNNN sequence (no seed
-- needed). Only the job card itself needs a new sequence row, one per
-- (tenant_id, device_code) already present in document_sequence — same
-- seeding pattern 0006 used for payment_out/PMT.

INSERT INTO document_sequence (tenant_id, doc_type, prefix, device_code, next_number)
SELECT DISTINCT tenant_id, 'job', 'JOB', device_code, 1
FROM document_sequence
WHERE doc_type = 'sale';

-- ---------------------------------------------------------------------
-- 5. v_job_split REWRITE (entry_type-aware, replaces is_returned filter)
-- ---------------------------------------------------------------------
-- Still reads job.labour_charge, not sale_line — known, deliberate gap.
-- Cannot be fixed until P6-5 defines what a job delivery's sale_line
-- rows look like. Logged in docs/phases/PHASE_6.md §8, not fixed here.
-- Planned: a second migration, 0011_job_split_v2.sql, after P6-5 lands.

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
        -- entry_type replaces the old is_returned filter. An 'issue' row
        -- contributes positively; a 'return' row contributes negatively
        -- (its unit_cost/unit_price are stored positive, snapshotting
        -- the issue row it reverses — negated here, not at write time).
        -- A fully-returned line nets to exactly zero, same SUM-of-signed-
        -- contributions pattern v_stock_on_hand/v_party_balance already use.
        SELECT  jp.job_id,
                SUM(CASE
                        WHEN jp.entry_type = 'issue'  AND jp.is_billable = 1
                            THEN jp.unit_price * jp.quantity / 1000
                        WHEN jp.entry_type = 'return' AND jp.is_billable = 1
                            THEN -(jp.unit_price * jp.quantity / 1000)
                        ELSE 0
                    END)                                          AS parts_charged,
                SUM(CASE
                        WHEN jp.entry_type = 'issue'  THEN jp.unit_cost * jp.quantity / 1000
                        WHEN jp.entry_type = 'return' THEN -(jp.unit_cost * jp.quantity / 1000)
                        ELSE 0
                    END)                                          AS parts_cost
        FROM    job_part jp
        GROUP BY jp.job_id
) parts ON parts.job_id = j.id;
