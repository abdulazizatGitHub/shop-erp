-- =====================================================================
--  ADDENDUM 15 - MULTI-TECHNICIAN ASSIGNMENT + CANCELLATION REASON
--  Migration version 15.
-- =====================================================================
--
--  WHY THIS EXISTS
--  Phase 14 (Jobs Module Redesign). Two real gaps found during P14-1
--  planning, both resolved by explicit owner decision, not invented:
--
--  1. job.assigned_to is a single mutable column — only one technician
--     can be on a job at a time. The owner wants two technicians
--     assignable to one job (each earning their own fixed commission,
--     configured in a future Settings phase — not built here, see
--     PROJECT.md BUG-COMMISSION-MULTI). New job_technician table is
--     INSERT-only for the assignment itself: unassigning sets
--     unassigned_at on the existing row rather than deleting it, so
--     assignment history survives (needed by P14-8's History panel).
--     job.assigned_to is NOT dropped or retired — job:assignTechnician
--     keeps writing both, so every existing reader of assigned_to
--     (JobPropertyPanel.tsx, JobsPage.tsx's technician column, the
--     legacy-fallback display P14-5 adds) keeps working unchanged.
--
--  2. job has no dedicated cancellation-reason column — only free-text
--     notes. P14-4's cancel-job flow needs a required reason from a
--     fixed list (owner decision OD-2: "Customer declined estimate" /
--     "Unrepairable" / "Customer collected unrepaired" / "Duplicate
--     job" / "Other"), stored separately from any intake notes so
--     cancelling a job never overwrites what was recorded at intake.
--
--  NOT added here: a "diagnosed fault" column. job.diagnosis (TEXT)
--  already exists (0001_init.sql) and has never been read or written
--  by any application code path — confirmed by grep across
--  packages/db, packages/contracts, and every apps/client/src/pages/jobs
--  file before writing this migration. Owner decision (Phase 14
--  planning session, 2026-09-20): reuse job.diagnosis rather than add a
--  second, duplicate column. The contracts/DTO layer names this field
--  diagnosedFault; the UI label is "Diagnosed fault"; the underlying
--  column stays diagnosis, unchanged, no ALTER needed for it.
--
--  No CHECK constraint on job.cancellation_reason, per project
--  convention (confirmed by grepping every existing migration — enums
--  are canonical in application/Zod code, not the DDL comment; see
--  DATABASE_RULES.md §3).
--
--  Table count: 49 -> 50 (job_technician is the only new table). View
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
-- 1. MULTI-TECHNICIAN ASSIGNMENT
-- ---------------------------------------------------------------------

CREATE TABLE job_technician (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenant(id),
    job_id          TEXT NOT NULL REFERENCES job(id),
    party_id        TEXT NOT NULL REFERENCES party(id),
    assigned_at     TEXT NOT NULL,
    unassigned_at   TEXT,
    created_at      TEXT NOT NULL
);
CREATE INDEX idx_job_technician_job ON job_technician (job_id);

-- ---------------------------------------------------------------------
-- 2. CANCELLATION REASON
-- ---------------------------------------------------------------------

ALTER TABLE job ADD COLUMN cancellation_reason TEXT;
    -- customer_declined_estimate | unrepairable |
    -- customer_collected_unrepaired | duplicate_job | other
    -- Set only by job:cancelJob (P14-4). Free-text `notes` is untouched
    -- by cancellation unless the owner explicitly adds a note, appended
    -- with a separator rather than overwriting intake notes.
