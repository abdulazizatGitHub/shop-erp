# Phase 4 — Printing + core reports

**Status:** COMPLETE — 2026-08-30. All P4-0/1/2/3/4/5 tasks closed out. Both receipt (P4-1) and invoice (P4-2) are fully built and wired end-to-end in the app, including the "Print Invoice" wholesale-only gating and BUG-A/B/C fixes, all confirmed on real hardware. P4-3's 5 reports, P4-4's backup/restore/retention, and P4-5a are DONE. **BUG-C VERIFIED on real hardware — 2026-08-30** (customer search race-condition fix confirmed for both Ahmad Retail and Khan Wholesale; credit sale completed successfully; underlying `party_ledger` posting also confirmed via seeded-data query this session). P4-2d DONE — invoice PDF content confirmed (`INV-0010`, Khan Wholesale). P4-5b DONE — 8/10 real hardware kill runs, all `integrity_check`=ok, final 2 runs waived by owner decision.
**Two items were closed by explicit owner decision without meeting their originally-written bar, not silently:** (1) P4-0's shop-PC-specific requirement was substituted by developer-machine verification (2026-08-29) — see §6. (2) P4-1d ("a physical page out of the printer, not a PDF file in tmp") and P4-2d's physical-print half were confirmed only as far as PDF content opening correctly in the system viewer on real hardware — no photo/description of actual paper output exists for either. Flagging this explicitly rather than letting "COMPLETE" imply more than what was verified; see exit criteria in §4.
**Started:** 2026-08-29
**Completed:** 2026-08-30
**Branch:** main
**Last commit:** 706a37d (uncommitted work this session — not yet committed)

---

## 1. Goal

The shop can hand a customer a printed receipt. The owner can see today's
sales, who owes money, and what stock is available. Data can be backed up
and restored. Power cuts do not lose data.

---

## 2. Scope

### In scope

- **P4-0 — Smoke test.** Owner clicks through SuppliersPage and
  PurchasePage on real hardware. Prerequisite for P4-3, per CF-4.
  **Status: P4-0 verified on developer machine (2026-08-29). Shop PC
  verification required before go-live. P4-5b (pull-the-plug test) also
  requires shop PC — cannot be substituted by unit tests. Both remain
  outstanding.**
- **P4-1 — Receipt printing.** Shares one PDF-generation code path with
  P4-2 via `pdfkit` (see CF-6). Two layout templates total: receipt and
  invoice — not two receipt templates for A4 vs A5. The receipt template
  takes a single page-size parameter (`'A4' | 'A5'`), sourced from a new
  "Receipt paper size" dashboard setting (default `A4`), read at print
  time. Print triggers after the sale transaction commits, never inside
  it; a print failure must never reverse or corrupt the committed sale;
  a Reprint button on the sale confirmation screen. Receipt shows doc
  number (CF-1), line quantities in sale UoM (CF-2), totals in PKR,
  date/time, shop name.
- **P4-2 — A4 wholesale invoice PDF.** Same `pdfkit` code path, its own
  layout template — always A4, no page-size setting. CF-1/CF-2/CF-3
  compliant. "Print Invoice" button on the sale confirmation shows only
  when the sale's customer is not Walk-in (`customerId` not null) AND
  `customerType === 'wholesale'` — counter sales to retail customers or
  Walk-in never show it (owner decision, 2026-08-30).
- **P4-1/P4-2 shared — "Receipt paper size" setting.** Dashboard
  settings page entry: `A4` / `A5`, default `A4`. Backed by the existing
  `setting` table — no new table, no new IPC channel beyond what P4-1
  already needs.
- **P4-3 — Core reports (read-only).** R1 daily sales summary, R2 stock
  on hand + valuation ("Last Purchase Cost" labeling per CF-3), R3
  receivables aging, R4 cash book (`payment.direction='in'` — confirmed
  correct against live schema, see CF-9), R5 Unit P&L. All read from
  existing views — no view arithmetic reimplemented in TypeScript.
- **P4-4 — Backup and restore.** Plain, unencrypted copy of the `.db`
  file to an owner-chosen folder, filename
  `ShopERP_backup_YYYY-MM-DD.db`. 30-file rotation. Restore with a
  confirmation dialog. DB connections cleanly closed and reopened on
  restore.
- **P4-5 — Pull-the-plug test.** Confirm WAL + synchronous=FULL from
  live connection code. 10x real kill/power-cut test on real hardware,
  `PRAGMA integrity_check` pasted for every run.

### Explicitly out of scope

- FBR e-invoicing
- Analytics dashboards beyond R1–R5
- Email/WhatsApp receipt sharing
- UoM conversion management UI (add/edit/delete)
- Wholesale price level data-entry UI
- **2-up printing** (two A5 receipts on one A4 sheet) — logged as a
  future feature request in PROJECT.md, not scheduled to any phase yet.
- Thermal printing — no thermal printer owned yet. Future settings
  toggle logged in PROJECT.md, deferred to Phase 5 or 8.
- **Backup encryption** — deferred to Phase 8 pending owner request
  (see CF-7).
- `payment_out` business logic — Phase 8
- `updateItem` — Phase 8
- True weighted-average costing (`avg_cost` fix) — Phase 8
- Any new IPC channel not directly required by P4-0–P4-5

---

## 3. Tasks

| ID      | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4-0    | Smoke test — SuppliersPage + PurchasePage on real hardware                                                                                                                                                                                                                                                                                                                                                                                                                              | **PARTIAL, closed by owner decision — verified on developer machine 2026-08-29; shop PC verification still recommended before go-live, not performed**                                                                                                                                                                                                                                                                                                      |
| P4-1a   | "Receipt paper size" setting on dashboard settings page (A4/A5, default A4)                                                                                                                                                                                                                                                                                                                                                                                                             | DONE — 2026-08-29                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P4-1b   | Receipt template — single template, page-size parameter, hand-calculated unit test                                                                                                                                                                                                                                                                                                                                                                                                      | DONE — 2026-08-29 (two layers: pure layout string in `packages/core`, thin pdfkit renderer in `apps/server`)                                                                                                                                                                                                                                                                                                                                                |
| P4-1c   | Receipt print-after-commit + Reprint button                                                                                                                                                                                                                                                                                                                                                                                                                                             | DONE — 2026-08-29 (control-flow/orchestration fully tested; shop name setting, temp-file writer all built). Print mechanism revised 2026-08-30: `shell.openPath()` replaces the original PowerShell `Start-Process -Verb Print` after real-hardware testing found the shop PC's default viewer (Edge) ignores the Print verb — see PROJECT.md's Known Hardware section.                                                                                     |
| P4-1d   | Real receipt print verification (shop's Windows printer, default A4) — **a physical page out of the printer, not a PDF file in tmp**                                                                                                                                                                                                                                                                                                                                                    | PARTIAL — 2026-08-30: PDF confirmed opening correctly in the system viewer on real hardware (INV-0009, via `shell.openPath()`). An actual physical page out of the printer has not been separately confirmed — no photo/description of paper output. Closed out by owner decision alongside the rest of Phase 4; see §6.                                                                                                                                    |
| P4-2a   | `pdfkit` as a direct dependency of `apps/server` — version **confirmed on real shop machine: 0.20.1, dist-tags {latest: '0.20.1'}**. Installed `pdfkit@0.20.1` (`^0.20.1` in package.json — matches house convention, every dependency in that file uses a caret range).                                                                                                                                                                                                                | DONE — 2026-08-29                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P4-2b   | Invoice template — hand-calculated unit test + PDF field assertions. `getSaleInvoiceData` (extends `getSaleReceiptData`) + `buildInvoiceLayout`, both TDD, `balanceDuePaisa` asserted explicitly. Found and fixed a real gap along the way: `PartyTable` (Kysely schema) was missing `address`, which the live `party` table has always had.                                                                                                                                            | DONE — 2026-08-30                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P4-2c   | Generated-PDF verification (doc number, line UoM, totals) — structural only (magic bytes + A4 `/MediaBox`); field content is NOT verified directly in the PDF bytes (pdfkit compresses the content stream by default — confirmed empirically, a `zlib.inflateSync` recovery attempt also didn't reliably work). Field correctness is covered by `invoice-layout.test.ts`'s exact-string assertions against the same text `renderInvoicePdf` draws unmodified. Known gap recorded in §5. | DONE — 2026-08-30                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P4-2d   | Real print of the A4 invoice — **needs owner's hardware.** After completing a sale to a wholesale customer, click "Print Invoice" (shown only when the customer is non-Walk-in and `customerType='wholesale'`), confirm a physical A4 page comes out showing doc number, customer name, at least one line item with UoM, grand total, and balance due.                                                                                                                                  | DONE — verified 2026-08-30. Invoice PDF confirmed: `INV-0010`, Customer: Khan Wholesale, Date: 2026-08-30, line `Compressor \| 1 Piece \| Rs 6,000 \| Rs 6,000`, Total Rs 6,000, Paid Rs 6,000, Balance Due Rs 0 (correct for a cash sale). Template verified working. As with P4-1d: this confirms PDF content in the system viewer, not a separately-confirmed physical printed page.                                                                     |
| P4-2e   | Wire into the app: `invoice:printSaleInvoice` IPC channel (same error-isolation as receipt — `printError` string, never throws), "Print Invoice" button on `SalePage.tsx`'s confirmation message, conditional on non-Walk-in + wholesale.                                                                                                                                                                                                                                               | DONE — 2026-08-30                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P4-3    | Read `CREATE VIEW` SQL for `v_daily_sales`/`v_stock_on_hand`/`v_party_balance`/unit-margin view                                                                                                                                                                                                                                                                                                                                                                                         | DONE — 2026-08-29                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P4-3-R1 | Daily sales summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | DONE — 2026-08-29                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P4-3-R2 | Stock on hand + valuation ("Last Purchase Cost" label — CF-3)                                                                                                                                                                                                                                                                                                                                                                                                                           | DONE — 2026-08-29                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P4-3-R3 | Receivables aging                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | DONE — 2026-08-29                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P4-3-R4 | Cash book — `purchase.payment_mode='cash'` for outflows, `payment.amount WHERE direction='in'` for inflows. Never `party_ledger` for this report.                                                                                                                                                                                                                                                                                                                                       | DONE — 2026-08-29                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P4-3-R5 | Unit P&L — direct margin, "Last Purchase Cost (COGS)" label + Phase 8 disclaimer                                                                                                                                                                                                                                                                                                                                                                                                        | DONE — 2026-08-29. Disclaimer wording resolved 2026-08-29 (CF-3, R5-specific sentence) — already matched verbatim, no code change needed.                                                                                                                                                                                                                                                                                                                   |
| P4-4b   | Retention rotation unit test (30-file cap, temp dir)                                                                                                                                                                                                                                                                                                                                                                                                                                    | DONE — 2026-08-29                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P4-4c   | Backup/restore integration test (real row counts, no mocks)                                                                                                                                                                                                                                                                                                                                                                                                                             | DONE — 2026-08-29                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P4-4d   | Restore confirmation dialog ("This will replace all current data. This cannot be undone.") + connection close/reopen                                                                                                                                                                                                                                                                                                                                                                    | DONE — 2026-08-29                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P4-5a   | Confirm WAL + synchronous=FULL on every connection (read live code)                                                                                                                                                                                                                                                                                                                                                                                                                     | DONE — 2026-08-29                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P4-5b   | 10x kill/power-cut test on real hardware, `integrity_check` pasted each run                                                                                                                                                                                                                                                                                                                                                                                                             | DONE — 2026-08-30. 8/10 real hardware kill runs completed, `integrity_check` = ok every time. Final 2 runs waived by owner decision (documented in PROJECT.md/PROGRESS.md). Programmatic transaction test also passing (`packages/db/src/transaction-atomicity.test.ts` — begins a `db.transaction()` inserting a `party_ledger` row, throws before commit, confirms the row does not exist afterward; supplements but does not replace the hardware test). |

---

## 4. Exit criteria

Closed 2026-08-30. 5 of 8 met exactly as originally written; 3 closed by
explicit owner decision short of the original bar — noted individually,
not silently ticked.

- [ ] P4-0 smoke test passed on the **shop PC** specifically — **NOT MET.**
      Only developer-machine verification (2026-08-29) was performed.
      Closed by explicit owner decision as a pragmatic substitute for code
      correctness only — does not cover hardware compatibility or
      non-technical user flow. Shop PC verification remains recommended
      before go-live.
- [ ] Receipt prints on the shop's actual Windows printer, default A4 —
      photo/description pasted — **NOT MET.** Real-hardware confirmation
      exists only for the PDF opening correctly in the system viewer via
      `shell.openPath()` (INV-0009). No photo or description of an actual
      physical printed page was provided for either the receipt (P4-1d) or
      the invoice (P4-2d).
- [x] A4 invoice PDF opens correctly — doc number, line UoM, totals
      confirmed. Verified 2026-08-30: `INV-0010`, Khan Wholesale, line
      `Compressor | 1 Piece | Rs 6,000 | Rs 6,000`, Total/Paid/Balance Due
      all correct for a cash sale.
- [x] R1–R5 each hand-calculated and matched against real report output.
      Done during P4-3 (2026-08-29) — hand-calculated expected values
      compared against real SQLite query output, no mocks.
- [x] Backup file restores into a working database on a different
      directory — row counts match, real files not mocks. Done during
      P4-4c (2026-08-29) — `backup.test.ts`, real seeded files.
- [ ] 10x pull-the-plug test — `PRAGMA integrity_check` returns "ok" every
      time — **NOT MET AS WRITTEN.** 8/10 real hardware runs completed,
      `integrity_check`=ok every time; the final 2 runs were waived by
      owner decision, not performed. A programmatic transaction-rollback
      test (`transaction-atomicity.test.ts`) supplements but does not
      replace this.
- [x] `npm run verify` exits 0. Confirmed 2026-08-30, 245/245 tests,
      typecheck clean, lint clean.
- [x] `PROJECT.md`/`PROGRESS.md` updated. This close-out.

---

## 5. Binding constraints (decisions locked before implementation begins)

- **Known test-coverage gap (recorded 2026-08-30):** pdfkit PDF field
  content is not inspected directly (content stream is compressed).
  Field correctness is guaranteed by layout unit tests. PDF structural
  validity is verified by MediaBox assertion. A silent pdfkit API
  regression would not be caught.
- **CF-1 (ADR-0012):** all doc numbers are `PREFIX-NNNN`.
- **CF-2 (ADR-0013):** receipts/invoices/sales reports show
  `sale_line.quantity` in `sale_uom_id` units; stock reports use
  `stock_movement.quantity`/`v_stock_on_hand` only.
- **CF-3:** `item.avg_cost` is last-purchase-cost, labeled accordingly
  everywhere it's displayed (R2, R5). Anywhere a margin/profit figure
  derived from it is shown, this exact sentence must accompany it —
  resolved 2026-08-29, this is the canonical wording, no other variant:
  "Margin shown uses last purchase cost per item. True weighted-average
  costing is Phase 8 work." Already matches verbatim in
  `report.repository.ts`'s `UNIT_PL_DISCLAIMER` constant and its test
  assertion — no code change needed, only this section was missing the
  actual sentence.
- **CF-4:** P4-0 smoke test must pass before any Phase 4 report reads
  purchase/supplier data.
- **CF-5:** Thermal printing is out of scope for Phase 4. Printer
  hardware confirmed as a standard Windows printer, A4/A5 paper, no
  thermal unit purchased. A settings toggle for thermal output is a
  future feature, logged in PROJECT.md.
- **CF-6 — PDF library:** `pdfkit`, direct dependency of `apps/server`
  only (main-process work, never `apps/client`). Version confirmed on
  the real shop machine 2026-08-29: `npm view pdfkit version` →
  `0.20.1`, `dist-tags` → `{ latest: '0.20.1' }`. Installed as
  `pdfkit@0.20.1` (`^0.20.1` in `package.json`, matching this file's own
  existing convention — every dependency there uses a caret range).
  Types via `@types/pdfkit` (devDependency of `apps/server` only —
  pdfkit ships no types of its own).
- **CF-7 — no backup encryption this phase:** Backup files are
  unencrypted plain SQLite `.db` copies. Encryption deferred to Phase 8
  pending owner request. Rationale: the live database on the shop PC is
  already unencrypted, so encrypting only the backup provides no
  meaningful improvement; a key-management failure would cause
  permanent unrecoverable data loss, which is worse for this use case
  than the privacy risk of a plain copy; encryption can be added later
  if the owner asks for it.
- **CF-8 — receipt paper size:** one receipt template, parameterized by
  a `'A4' | 'A5'` page-size value passed to `pdfkit`, sourced from a new
  "Receipt paper size" dashboard setting (default `A4`), stored in the
  existing `setting` table. 2-up printing explicitly not built this
  phase.
- **CF-9 — R4 cash-book discriminator, verified against live code
  (2026-08-29):** `payment.direction` (`'in' | 'out'`, TEXT NOT NULL)
  exists on the `payment` table (`0001_init.sql:464`,
  `kysely-schema.ts:255`). `payment` has **no** `doc_type` column —
  `doc_type` exists only on the separate `document_sequence` table and
  is irrelevant to querying committed `payment` rows. R4 reads
  `payment.amount WHERE direction='in'`, matching PHASE_3.md §5/§8's
  original design. An owner-proposed correction to
  `doc_type='payment_in'` was checked against this evidence, found
  incorrect, and not applied.

---

## 6. Open questions blocking this phase

None blocking Phase 4 itself as of 2026-08-30 (see §4). **P4-0 verified
on developer machine (2026-08-29)**, per the owner's explicit pragmatic
substitution — covers code correctness, not hardware compatibility or
non-technical user flow. This section previously stated that shop PC
verification and P4-5b "remain required before Phase 4 can be marked
COMPLETE" — the owner has since explicitly closed Phase 4 without shop
PC verification (P4-0) and with P4-5b at 8/10 real hardware runs (final
2 waived). Recording this as a deliberate closing decision, not a
silent contradiction of what this section said earlier. Shop PC
verification remains recommended before go-live regardless of Phase 4's
status.

Non-blocking, informational only:

2. **PC specification** — tracked as PROJECT.md Q8 since 2026-08-08,
   now also relevant to P4-5 (needs the actual shop machine). Still
   not confirmed. Proceeding without it.
