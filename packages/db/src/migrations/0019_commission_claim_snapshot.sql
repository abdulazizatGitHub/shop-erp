-- =====================================================================
--  ADDENDUM 19 - COMMISSION CLAIM SNAPSHOT + OUTSIDE-HISTORY REASON
--  Migration version 19.
-- =====================================================================
--
--  WHY THIS EXISTS
--  Phase 16, P16-3a Checkpoint 1b (docs/phases/PHASE_16.md §2a OD-16-12,
--  docs/decisions/ADR-0015-commission-claims.md). Two independent fixes
--  to 0018, applied as ADD COLUMN — 0018 is already applied in dev DBs
--  and is never edited.
--
--  1. commission_claim gets its own snapshot of the service charge's
--     commission config and the sale_line's quantity, as they were AT
--     DELIVERY TIME. Without this, re-reading service_charge later (at
--     approval, or in a report) would show whatever the charge's config
--     is NOW — wrong if the owner edits the charge's commission amount
--     or mode after some claims already exist against it, and
--     labour_amount_paisa already null-scenario-checked in core would
--     have no matching mode/bp to interpret it with. commission_mode is
--     derived elsewhere (service-charge.repository.port.ts), never
--     stored on service_charge itself — this is the one place it IS
--     stored, precisely because it's a historical snapshot, not current
--     config.
--
--     SQLite requires a DEFAULT to ADD COLUMN ... NOT NULL. Both tables
--     are empty in every environment (0018 has no writer yet — that's
--     Checkpoint 2's job), so no existing row is ever actually backfilled
--     with these defaults; they exist only to satisfy SQLite's syntax.
--     commission_mode defaults to 'none' (the "no claim" case — never
--     actually meaningful since 'none' mode never creates a claim, but a
--     safe, non-money default). quantity_milli defaults to 1000 (one
--     whole unit — the only value job-delivery.repository.ts's labour
--     lines have ever used, per commission-claim.ts's own header note).
--
--  2. commission_decision_recipient gets outside_history_reason — OD-16-12
--     (Checkpoint 1b, correcting the Checkpoint 1 assumption that a
--     recipient must be in the job's technician assignment history).
--     Since technicians are locked at ready/delivered/cancelled
--     (P16-3c), a wrong or missing assignment record would make the
--     correct person unpayable. New rule: a recipient may be any active
--     staff party; one NOT in the job's assignment history requires a
--     non-blank trimmed reason here (core + Zod enforced in Checkpoint
--     2); an in-history recipient stores NULL. Nullable, no DEFAULT
--     needed.
--
--  Stale-comment correction (FIX-C4): 0018's own header says the
--  delivery hook and approve/reject/reverse services land with "P16-3b" —
--  that's wrong and 0018 is never edited to fix it. They land in P16-3a's
--  own Checkpoint 2, not the separate P16-3b (Commission Approvals UI)
--  task.
--
--  unassign_reason (job_technician, P16-3c) is still NOT in this
--  migration — still its own concern, still added by its own migration
--  (now 0020, renumbered because this migration took 0019) when P16-3c
--  is built.
--
--  Applied inside migration-runner.ts's own transaction wrapper — same
--  note as every migration from 0006 on: no explicit BEGIN here.
-- =====================================================================

ALTER TABLE commission_claim ADD COLUMN commission_mode TEXT NOT NULL DEFAULT 'none';
ALTER TABLE commission_claim ADD COLUMN commission_amount_paisa INTEGER;
ALTER TABLE commission_claim ADD COLUMN commission_bp INTEGER;
ALTER TABLE commission_claim ADD COLUMN quantity_milli INTEGER NOT NULL DEFAULT 1000;

ALTER TABLE commission_decision_recipient ADD COLUMN outside_history_reason TEXT;
