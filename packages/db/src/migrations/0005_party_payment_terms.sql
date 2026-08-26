-- =====================================================================
--  ADDENDUM 05 - SUPPLIER PAYMENT TERMS
--  Migration version 5.
-- =====================================================================
--
--  WHY THIS EXISTS
--  Phase 2 (docs/phases/PHASE_2.md, P2-1) specs a supplier field list
--  that includes payment_terms. No such column exists anywhere in the
--  schema through 0001_init.sql - confirmed by reading the live party
--  table definition and grepping the whole repo. Free text, nullable:
--  nothing yet reads or enforces this field structurally (no due-date
--  math, no terms-based aging in this phase), so a plain TEXT column is
--  sufficient. Kept as its own migration rather than folded into 0004,
--  since 0004 is scoped to party_ledger bill metadata and this touches
--  a different table.
-- =====================================================================

ALTER TABLE party ADD COLUMN payment_terms TEXT;
