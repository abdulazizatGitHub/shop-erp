-- =====================================================================
--  ADDENDUM 21 - CASH_MOVEMENT
--  Migration version 21.
-- =====================================================================
--
--  WHY THIS EXISTS
--  BUG-31 (PROJECT.md), Phase 17.5 (docs/phases/PHASE_17_5.md), ADR-0016.
--  The cash session's expected_cash formula (cash-session.repository.ts)
--  has no term for cash added to or removed from the drawer that is not
--  a sale, purchase, expense, or party payment (a bank deposit, cash
--  taken by the owner, a float top-up). This table fills that one gap.
--
--  Append-only (ADR-0004): no UPDATE, no DELETE, ever. A correction is
--  a new row with `amount` negated AND `reverses_id` set to the
--  original's id (review round 2, R3) -- the original row is never
--  touched. UNIQUE(reverses_id) enforces "reversed at most once" (same
--  precedent as commission_decision_reversal's UNIQUE(decision_id),
--  ADR-0015). reverses_id points from the reversal BACK to the
--  original -- the opposite direction from stock_movement's
--  reversed_by_id, which DATABASE_RULES.md section 3 records as never
--  actually written by any application code path; here there is
--  exactly one write path (reverseMovement()) that sets it, in the
--  same insert that creates the reversal row.
--
--  note is NOT NULL -- required (non-blank, core-enforced) on every
--  movement, all types, not only 'other' (review round 2, R4: a
--  mitigation for the accepted no-auth risk recorded in ADR-0016).
--
--  No business_unit_id column (deliberately) -- see ADR-0016: whole-
--  till cash reconciliation has never been unit-scoped in this schema
--  (cash_session itself has no such column either). No party_id column
--  (deliberately) -- see ADR-0016's rejected alternatives (a payment to
--  a dummy party would pollute the party ledger). No cash_session_id
--  column -- every sibling table (sale, purchase, expense, payment)
--  associates with a day's session purely by date, never by FK; reads
--  here follow the same pattern. WRITES are different (review round 2,
--  R2): a movement may only be recorded while a session is open,
--  enforced in core (CashSessionNotOpenError) since there is no FK to
--  check against here.
--
--  Table count: +1 (cash_movement). View count: unchanged.
--
--  No BEGIN/COMMIT here -- migration-runner.ts already wraps
--  db.exec(migration.sql) in its own db.transaction() closure, same
--  note as every migration from 0006 on.
-- =====================================================================

CREATE TABLE cash_movement (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    doc_no          TEXT NOT NULL,
    movement_date   TEXT NOT NULL,
    movement_type   TEXT NOT NULL,
        -- bank_deposit | owner_draw | float_add | other
    amount          INTEGER NOT NULL,       -- paisa, SIGNED (+in / -out)
    note            TEXT NOT NULL,          -- required (non-blank) on EVERY movement, all types -- core-enforced, not a CHECK constraint (DATABASE_RULES.md section 3, "enum-like columns are canonical in application code")
    reverses_id     TEXT REFERENCES cash_movement(id),  -- set ONLY on a reversal row, pointing back at the original it corrects. NULL for an original (non-reversal) movement.
    created_at      TEXT NOT NULL,
    created_by      TEXT REFERENCES app_user(id),
    UNIQUE (tenant_id, doc_no),
    UNIQUE (reverses_id)
);
CREATE INDEX idx_cm_date ON cash_movement (tenant_id, movement_date);
