-- =====================================================================
--  ADDENDUM 18 - COMMISSION CLAIMS AND DECISIONS
--  Migration version 18.
-- =====================================================================
--
--  WHY THIS EXISTS
--  Phase 16, P16-3a (docs/phases/PHASE_16.md §2a OD-16-1..OD-16-3a,
--  docs/decisions/ADR-0015-commission-claims.md). Replaces Phase 7's
--  automatic per-technician commission (party.commission_bp, retired —
--  column stays, never edit an applied migration) with an owner-approved
--  claim model:
--
--  1. Delivering a job with a commission-configured labour line writes
--     one commission_claim row INSIDE the delivery transaction (checked
--     directly — party_ledger has no CHECK constraint on entry_type or
--     source_type, confirmed by reading 0001_init.sql before writing
--     this migration; 'commission' and 'commission_decision' are valid
--     as-is, no schema change needed there). A claim is not money.
--     UNIQUE(sale_line_id) — one delivered labour line can never
--     produce two claims (checked before P16-3b's delivery-hook work
--     even starts, so the constraint exists first).
--
--  2. The owner approves or rejects a claim, naming 0..N recipients on
--     approval (each a technician present in the job's technician
--     assignment history, active or removed — enforced in core, not
--     here). commission_decision.attempt_no + UNIQUE(claim_id,
--     attempt_no) — NOT UNIQUE(claim_id) alone (GAP-1, OD-16-3a): a
--     wrong decision must be correctable via commission_decision_reversal
--     rather than uncorrectable forever. attempt_no = count of existing
--     decisions for that claim + 1, computed in core.
--
--  3. commission_decision_recipient is a separate table (not columns on
--     commission_decision) because one decision can pay 0 (rejected) to
--     N (approved) recipients, each with an independently-chosen
--     integer paisa amount — not derivable from the claim's single
--     suggested_amount_paisa. UNIQUE(decision_id, technician_party_id)
--     — the same technician can't appear twice in one decision's
--     recipient list.
--
--  4. commission_decision_reversal — UNIQUE(decision_id): a decision can
--     be reversed at most once. Reversing writes this row plus (for an
--     approved decision) one reversing party_ledger row per original
--     recipient, in the SAME transaction as this row (core's job, not
--     this migration's). A claim whose latest decision has a reversal
--     is pending again and can receive attempt_no + 1.
--
--  unassign_reason (job_technician, P16-3c) is NOT in this migration —
--  it's a separate concern, added by its own migration when P16-3c is
--  built.
--
--  Applied inside migration-runner.ts's own transaction wrapper — same
--  note as every migration from 0006 on: no explicit BEGIN here.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. COMMISSION_CLAIM
-- ---------------------------------------------------------------------

CREATE TABLE commission_claim (
    id                          TEXT PRIMARY KEY,
    tenant_id                   TEXT NOT NULL REFERENCES tenant(id),
    job_id                      TEXT NOT NULL REFERENCES job(id),
    sale_line_id                TEXT NOT NULL REFERENCES sale_line(id),
    service_charge_id           TEXT NOT NULL REFERENCES service_charge(id),
    labour_amount_paisa         INTEGER NOT NULL,   -- the sale_line's charged total (post operator-override) the suggestion was computed from
    suggested_amount_paisa      INTEGER NOT NULL,
    suggested_recipient_party_id TEXT REFERENCES party(id),  -- nullable — no technician active on the job at delivery time
    created_at                  TEXT NOT NULL,
    UNIQUE (sale_line_id)
);
CREATE INDEX idx_commission_claim_job ON commission_claim (tenant_id, job_id);

-- ---------------------------------------------------------------------
-- 2. COMMISSION_DECISION
-- ---------------------------------------------------------------------

CREATE TABLE commission_decision (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenant(id),
    claim_id    TEXT NOT NULL REFERENCES commission_claim(id),
    attempt_no  INTEGER NOT NULL,
    decision    TEXT NOT NULL,      -- 'approved' | 'rejected' — canonical in application code (DATABASE_RULES.md, no CHECK)
    reason      TEXT,               -- required for 'rejected', null for 'approved' — enforced in core, not here
    decided_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    UNIQUE (claim_id, attempt_no)
);

-- ---------------------------------------------------------------------
-- 3. COMMISSION_DECISION_RECIPIENT
-- ---------------------------------------------------------------------

CREATE TABLE commission_decision_recipient (
    id                   TEXT PRIMARY KEY,
    tenant_id            TEXT NOT NULL REFERENCES tenant(id),
    decision_id          TEXT NOT NULL REFERENCES commission_decision(id),
    technician_party_id  TEXT NOT NULL REFERENCES party(id),
    amount_paisa         INTEGER NOT NULL,   -- > 0 checked in core, not here
    UNIQUE (decision_id, technician_party_id)
);

-- ---------------------------------------------------------------------
-- 4. COMMISSION_DECISION_REVERSAL
-- ---------------------------------------------------------------------

CREATE TABLE commission_decision_reversal (
    id           TEXT PRIMARY KEY,
    tenant_id    TEXT NOT NULL REFERENCES tenant(id),
    decision_id  TEXT NOT NULL REFERENCES commission_decision(id),
    reason       TEXT NOT NULL,     -- non-blank, trimmed — enforced in core, not here
    reversed_at  TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    UNIQUE (decision_id)
);
