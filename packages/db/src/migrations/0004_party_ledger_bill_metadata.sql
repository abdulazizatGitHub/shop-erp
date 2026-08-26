-- =====================================================================
--  ADDENDUM 04 - PARTY_LEDGER BILL METADATA
--  Migration version 4.
-- =====================================================================
--
--  WHY THIS EXISTS
--  Phase 2 P2-2 (credit purchases) and P2-3 (supplier opening balance
--  import) both need to record a supplier bill's reference number, due
--  date, and free notes against the party_ledger row they post. These
--  are separate, queryable fields — not appended to the existing
--  running_note free-text column, which would make them unqueryable and
--  would risk truncation/formatting ambiguity on re-parse.
--
--  All three columns are nullable: cash purchases post no party_ledger
--  row at all (nothing to write them onto), and a credit purchase may
--  simply not supply them.
-- =====================================================================

ALTER TABLE party_ledger ADD COLUMN bill_reference TEXT;
ALTER TABLE party_ledger ADD COLUMN due_date       TEXT;
ALTER TABLE party_ledger ADD COLUMN bill_notes     TEXT;
