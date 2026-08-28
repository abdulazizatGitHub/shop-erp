-- =====================================================================
--  ADDENDUM 06 - DOCUMENT NUMBERING REFORMAT
--  Migration version 6.
-- =====================================================================
--
--  WHY THIS EXISTS
--  ADR-0012. Every doc_no/party_code minted so far (sale, purchase,
--  payment, customer/supplier party_code) used
--  formatDocNumber(prefix, deviceCode, sequence), producing
--  PREFIX-DEVICECODE-NNNNNN (6-digit padding, device code embedded —
--  e.g. 'INV-A-000042'). ADR-0012 specifies PREFIX-NNNN instead
--  (4-digit minimum, no device code — 'INV-0042'). This migration
--  reformats every existing row already in that old shape.
--
--  The GLOB guard '*-*-[0-9][0-9][0-9][0-9][0-9][0-9]' matches only
--  strings ending in a literal '-' followed by exactly six digits,
--  preceded by another '-' — i.e. exactly the old PREFIX-DEVICE-NNNNNN
--  shape. It is defensive: any row that does not match this exact old
--  shape (there should be none) is left untouched, never guessed at.
--  It is also naturally idempotent — a row already reformatted to
--  PREFIX-NNNN has only one hyphen, so it can never match this
--  two-hyphen pattern on a re-run.
--
--  Two UPDATEs per column (below 10000 / at-or-above 10000) because
--  the padding rule itself branches: pad to 4 digits under 10000,
--  display as-is (no padding) at or above it. Applied to sale.doc_no,
--  purchase.doc_no, payment.doc_no, and party.party_code (customer and
--  supplier rows only — party_code is not doc-numbered for other
--  party_type values, e.g. staff).
--
--  Separately, document_sequence's single 'payment'/'PAY' row is
--  renamed to 'payment_in'/'RCP' (every payment row created so far has
--  direction='in' — no supplier-payment-out code path exists yet, see
--  PROJECT.md), and an unused 'payment_out'/'PMT' row is seeded per
--  existing (tenant_id, device_code) pair as a seam for that future
--  work (Phase 4/8) — matching other already-present unused seams in
--  this schema (sync_outbox, is_fiscal).
--
--  No BEGIN/COMMIT here: packages/db/src/migration-runner.ts already
--  wraps db.exec(migration.sql) in its own db.transaction() closure —
--  an explicit BEGIN here would fail with "cannot start a transaction
--  within a transaction".
-- =====================================================================

-- ---- sale.doc_no ----
UPDATE sale SET doc_no = substr(doc_no, 1, instr(doc_no, '-') - 1) || '-' ||
    printf('%04d', CAST(substr(doc_no, -6) AS INTEGER))
WHERE doc_no GLOB '*-*-[0-9][0-9][0-9][0-9][0-9][0-9]'
  AND CAST(substr(doc_no, -6) AS INTEGER) < 10000;

UPDATE sale SET doc_no = substr(doc_no, 1, instr(doc_no, '-') - 1) || '-' ||
    CAST(CAST(substr(doc_no, -6) AS INTEGER) AS TEXT)
WHERE doc_no GLOB '*-*-[0-9][0-9][0-9][0-9][0-9][0-9]'
  AND CAST(substr(doc_no, -6) AS INTEGER) >= 10000;

-- ---- purchase.doc_no ----
UPDATE purchase SET doc_no = substr(doc_no, 1, instr(doc_no, '-') - 1) || '-' ||
    printf('%04d', CAST(substr(doc_no, -6) AS INTEGER))
WHERE doc_no GLOB '*-*-[0-9][0-9][0-9][0-9][0-9][0-9]'
  AND CAST(substr(doc_no, -6) AS INTEGER) < 10000;

UPDATE purchase SET doc_no = substr(doc_no, 1, instr(doc_no, '-') - 1) || '-' ||
    CAST(CAST(substr(doc_no, -6) AS INTEGER) AS TEXT)
WHERE doc_no GLOB '*-*-[0-9][0-9][0-9][0-9][0-9][0-9]'
  AND CAST(substr(doc_no, -6) AS INTEGER) >= 10000;

-- ---- payment.doc_no ----
UPDATE payment SET doc_no = substr(doc_no, 1, instr(doc_no, '-') - 1) || '-' ||
    printf('%04d', CAST(substr(doc_no, -6) AS INTEGER))
WHERE doc_no GLOB '*-*-[0-9][0-9][0-9][0-9][0-9][0-9]'
  AND CAST(substr(doc_no, -6) AS INTEGER) < 10000;

UPDATE payment SET doc_no = substr(doc_no, 1, instr(doc_no, '-') - 1) || '-' ||
    CAST(CAST(substr(doc_no, -6) AS INTEGER) AS TEXT)
WHERE doc_no GLOB '*-*-[0-9][0-9][0-9][0-9][0-9][0-9]'
  AND CAST(substr(doc_no, -6) AS INTEGER) >= 10000;

-- ---- party.party_code (customer + supplier only) ----
UPDATE party SET party_code = substr(party_code, 1, instr(party_code, '-') - 1) || '-' ||
    printf('%04d', CAST(substr(party_code, -6) AS INTEGER))
WHERE party_type IN ('customer', 'supplier')
  AND party_code GLOB '*-*-[0-9][0-9][0-9][0-9][0-9][0-9]'
  AND CAST(substr(party_code, -6) AS INTEGER) < 10000;

UPDATE party SET party_code = substr(party_code, 1, instr(party_code, '-') - 1) || '-' ||
    CAST(CAST(substr(party_code, -6) AS INTEGER) AS TEXT)
WHERE party_type IN ('customer', 'supplier')
  AND party_code GLOB '*-*-[0-9][0-9][0-9][0-9][0-9][0-9]'
  AND CAST(substr(party_code, -6) AS INTEGER) >= 10000;

-- ---- document_sequence: payment -> payment_in/RCP, seed payment_out/PMT ----
UPDATE document_sequence
SET doc_type = 'payment_in', prefix = 'RCP'
WHERE doc_type = 'payment';

INSERT INTO document_sequence (tenant_id, doc_type, prefix, device_code, next_number)
SELECT DISTINCT tenant_id, 'payment_out', 'PMT', device_code, 1
FROM document_sequence
WHERE doc_type = 'payment_in';
