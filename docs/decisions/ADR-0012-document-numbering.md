# ADR-0012 — Document numbering format

Status: ACCEPTED
Date: 2026-08-28

## Decision

All human-readable document numbers use the format PREFIX-NNNN
where NNNN is a zero-padded integer with no upper limit and no
annual reset.

Prefixes:
INV — invoice / counter sale bill
CUS — customer
SUP — supplier
RCP — receipt (payment received from customer)
PMT — payment out (to supplier)
PUR — purchase from supplier

Item codes (item.code) are explicitly out of scope. This ADR covers
customer-facing document numbers only. (Added 2026-08-30, resolving
PROJECT.md BUG-X: item codes are internal catalogue references, not
customer-facing document numbers, and remain in their existing
`ITM-A-000001` format — no migration.)

## Rules

1. The counter is stored in document_sequence.next_number as
   INTEGER with no upper bound and no year column.

2. Display formatting pads to 4 digits minimum. If next_number
   exceeds 9999 the number displays as-is (5+ digits, no break).

3. At go-live the INV sequence is seeded to (last paper pad bill
   number + 1). All other sequences start at 1 unless the owner
   specifies otherwise.

4. The device_code column remains in document_sequence for future
   multi-device collision prevention but is NOT included in the
   displayed number. The displayed number is PREFIX-NNNN only.

5. Existing doc_no values in the database are reformatted to the
   new PREFIX-NNNN shape in the migration that introduces this
   ADR. See migration notes below — the reformatting needed is
   narrower than originally assumed; see the correction note.

## Affected document_sequence doc_type values

doc_type Prefix (live code, today) Prefix (this ADR) Change needed

---

sale INV INV Display format only (see below)
customer CUS CUS Display format only
supplier SUP SUP Display format only
payment PAY (direction always 'in') RCP (payment_in) Rename doc_type + prefix
(new) — (no code path yet) PMT (payment_out) New doc_type, seeded, no rows yet
purchase PUR PUR Display format only

**Correction against the original draft of this ADR (recorded here,
not silently fixed, per CLAUDE.md Golden Rule 6 — "the live code is
the truth"):** the draft handed into this phase's kickoff assumed
`sale` was seeded under `doc_type='sale'`/prefix `SAL`, with existing
rows shaped like `SAL-A-000001`. Reading the live code
(`packages/db/src/repositories/sale.repository.ts`,
`packages/shared/src/id.ts`, `packages/shared/src/id.test.ts`) shows
this was never true: `sale` has used `doc_type='sale'`/prefix `INV`
since Phase 3 shipped. **No `SAL-`-prefixed row has ever existed in
this schema.** What _is_ true, and what the migration actually needs
to fix, is narrower than "rename the prefix": every one of the five
existing doc types (`sale`/INV, `customer`/CUS, `supplier`/SUP,
`purchase`/PUR, `payment`/PAY) is generated today via
`formatDocNumber(prefix, deviceCode, sequence)`
(`packages/shared/src/id.ts:25-27`), which produces
`PREFIX-DEVICECODE-NNNNNN` — e.g. `INV-A-000123`, 6-digit padding,
device code embedded — not the `PREFIX-NNNN` this ADR specifies (4
digit minimum, no device code). So the real migration work is:
(a) a new display formatter dropping the device code segment and
padding to 4 digits minimum, applied to all five existing doc types'
stored `doc_no` values, and (b) renaming `payment`/`PAY` to
`payment_in`/`RCP` and adding an unused `payment_out`/`PMT` row —
the only case where a `doc_type` or prefix genuinely changes.

## Reason

The shop's existing paper pad system uses a continuous bill
number recorded alongside a date on every bill. Staff and
customers reference bills by number. Continuity with the paper
record at go-live is more important than encoding the year in
the number. The date field on every document already carries
the year. Exceeding 4 digits is safe and automatic — the INTEGER
counter has no ceiling.
