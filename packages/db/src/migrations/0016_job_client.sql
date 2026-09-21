-- =====================================================================
--  ADDENDUM 16 - JOB_CLIENT TABLE (SEPARATE FROM PARTY)
--  Migration version 16.
-- =====================================================================
--
--  WHY THIS EXISTS
--  Phase 15 (Job Client Table + On-site Jobs + Awaiting Parts Flow).
--  Fixes BUG-JOBCLIENT-1 (PROJECT.md §4): job intake's client search has
--  been querying party_type='customer' — the Spare Parts ledger
--  population — since Phase 14. Job clients (people bringing in an
--  AC/fridge/oven for repair) are a distinct population from ledger
--  customers and need their own table.
--
--  Owner decision Q-P15-1 (PROJECT.md §5, 2026-09-20): job_client is a
--  SEPARATE table, not a party_type='job_client' row on the existing
--  party table. No party row is created for a job client by this
--  migration or any future job-client code path. The party table and
--  its ledger (party_ledger) are completely untouched here.
--
--  job.customer_id (0001_init.sql) is NOT dropped or retired by this
--  migration, per DATABASE_RULES.md §4 ("never edit a migration that
--  has been applied to any real database") and CLAUDE.md §3.3's
--  append-only spirit applied to schema: it stays in place, unused by
--  new code from Phase 15 forward. New code reads job.job_client_id.
--
--  job_client.phone/phone_2 are free TEXT, no UNIQUE or CHECK
--  constraint — same convention as party.phone (0001_init.sql), which
--  also has none. Application code (Phase 15's JobClientPicker/
--  job-client repository) enforces the 11-digit format and the
--  name+phone dedup rule; the DDL does not, per DATABASE_RULES.md §3's
--  "enum-like columns are canonical in application code" convention
--  extended here to format validation generally (no CHECK constraints
--  exist anywhere in this schema for phone-shaped columns — confirmed
--  by grep across every migration file before writing this one).
--
--  Table count: 50 -> 51 (job_client is the only new table). View
--  count: unchanged at 11. migration-runner.test.ts's hardcoded counts
--  updated in this same session, re-run after applying this migration,
--  not assumed.
--
--  No BEGIN/COMMIT here: packages/db/src/migration-runner.ts already
--  wraps db.exec(migration.sql) in its own db.transaction() closure --
--  an explicit BEGIN here would fail with "cannot start a transaction
--  within a transaction" (same note as every migration from 0006 on).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. JOB_CLIENT TABLE (OD-2 — exact column list, owner-specified)
-- ---------------------------------------------------------------------

CREATE TABLE job_client (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    name            TEXT NOT NULL,
    phone           TEXT,                    -- nullable, 11 digits (app-enforced)
    phone_2         TEXT,                    -- nullable, second number
    address         TEXT,                    -- nullable
    area            TEXT,                    -- neighbourhood/village
    landmark        TEXT,                    -- "next to blue mosque" — critical
                                              -- for Malakand field navigation
    notes           TEXT,                    -- nullable
    created_at      TEXT NOT NULL
);
CREATE INDEX idx_job_client_tenant ON job_client (tenant_id);
CREATE INDEX idx_job_client_name   ON job_client (tenant_id, name);

-- ---------------------------------------------------------------------
-- 2. JOB.JOB_CLIENT_ID (OD-3 — nullable, additive; customer_id untouched)
-- ---------------------------------------------------------------------

ALTER TABLE job ADD COLUMN job_client_id TEXT REFERENCES job_client(id);
