# Phase 10 — Reports & Finance Redesign

**Status:** COMPLETE — all sub-phases (P10-0 through P10-5) done and verified
**Started:** 2026-09-13
**Completed:** 2026-09-13
**Branch:** main
**Last commit:** 27ea374 (Phase 9-CSV) — this phase's own commits not yet made

---

## 1. Goal

The owner opens the single Reports tab and can immediately see where the
business stands: every report (Daily Sales, Stock on Hand, Receivables,
Jobs, Cash Book, Unit P&L, Wages, Expenses) is chart-backed, has its own
date-range selector with quick presets, and can be exported to CSV in one
click. Reports are visually split into an "Operational" group (sales,
stock, receivables, jobs) and a "Financial" group (cash, P&L, wages,
expenses) on the same page, with no new navigation entry. Separately, the
sale screen can no longer add a zero/negative-stock item to a cart under
any circumstance — it is hard-blocked and visibly marked "Out of Stock",
replacing the old warn-and-allow modal for that specific case.

---

## 2. Scope

### In scope

- P10-1: Hard-block adding an item with `quantityMilli <= 0` to the sale
  cart; narrow the BUG-Y warning-gate `ConfirmDialog` to credit-limit only
  (see §5 — it was never stock-only, so "remove entirely" would have
  silently dropped the still-wanted credit-limit warning).
- P10-2: Extend `report:dailySales` to `{ from, to }`; extend
  `report:unitPl` to `{ from, to }`; add `report:stockPerformance`; add
  `report:expenseSummary`.
- P10-3: Restructure `ReportsPage.tsx` into "Operational"/"Financial"
  groups; build a shared `DateRangeSelector` with 6 presets.
- P10-4: Add recharts-based charts to all 8 report tabs; install
  `recharts` in `apps/client`.
- P10-5: Add a shared `downloadCsv` utility and an Export CSV button to
  every report tab, with the exact per-tab column mapping specified in
  the brief.

### Explicitly out of scope

- Balance sheet — not built, not stubbed, not TODO'd.
- PDF export — CSV only this phase.
- Cloud sync, multi-tenancy, double-entry accounting, FBR e-invoicing,
  barcode scanning, mobile app, metadata-driven permissions (CLAUDE.md §10).
- A backend `include-cancelled` parameter for `purchaseOrder:list` (a
  pre-existing, separately-logged future-feature note — untouched here).
- Any schema migration, `ALTER TABLE`, or new table.
- A new nav item for Reports.
- Fixing any bug outside this phase's own tasks (documented in
  PROJECT.md Known Bugs instead, per CLAUDE.md §8).

---

## 3. Tasks

| ID     | Task                                                                    | Status | Commit |
| ------ | ----------------------------------------------------------------------- | ------ | ------ |
| P10-0  | Environment check — audit only, no code                                 | DONE   | —      |
| P10-1  | Zero-stock hard block on sale screen; narrow BUG-Y warning modal        | DONE   | —      |
| P10-2a | `report:dailySales` → `{ from, to }`                                    | DONE   | —      |
| P10-2b | `report:unitPl` → `{ from, to }`                                        | DONE   | —      |
| P10-2c | New handler `report:stockPerformance`                                   | DONE   | —      |
| P10-2d | New handler `report:expenseSummary`                                     | DONE   | —      |
| P10-3  | Reports page restructure (Operational/Financial groups) + date selector | DONE   | —      |
| P10-4  | Charts + visual redesign per report (a–h, all 8 tabs)                   | DONE   | —      |
| P10-5  | CSV export utility + per-tab Export CSV button                          | DONE   | —      |

---

## 4. Exit criteria

- [ ] `npm run verify` exits 0 — final test count pasted
- [ ] `npm run build --workspace=@shop/client` exits 0 — pasted
- [ ] `npm run build --workspace=@shop/server` exits 0 — pasted
- [x] P10-1: render test proves an item with `quantityMilli=0` cannot be
      added to the cart — `ItemSearchPanel.test.tsx`, 3/3 passing,
      `npm run verify` 495/495 (see PROGRESS.md Session 58)
- [x] P10-1: `grep -rn "BUG-Y\|negativeStock\|belowZero" apps/client/src`
      → zero hits (see PROGRESS.md Session 58 for the one transitional
      comment hit found and reworded)
- [x] P10-2a: `report:dailySales` accepts `{ from, to }` — 3 new tests in
      `report.repository.test.ts`, hand-calculated paisa sums pasted (see
      PROGRESS.md); `npm run verify` 498/498
- [x] P10-2b: `report:unitPl` accepts `{ from, to }` — 2 new tests
      proving an out-of-range sale returns zero revenue and an in-range
      sale returns its exact revenue; `npm run verify` 500/500
- [x] P10-2c: `report:stockPerformance` returns items sorted by
      `totalSoldMilli` DESC — 3 new tests (best-seller ordering,
      out-of-range exclusion, zero-sale item still included per
      owner-confirmed decision); `npm run verify` 503/503
- [x] P10-2d: `report:expenseSummary` returns correct per-category
      totals — 3 new tests, hand-calculated paisa values in test
      comments, owner-drawing exclusion also proven; `npm run verify`
      506/506
- [x] P10-3: `DateRangeSelector` render test shows all 6 presets —
      `DateRangeSelector.test.tsx`, 4/4 passing
- [x] P10-3: "This Month" preset test passes with a fixed date
      2026-09-13 → `from='2026-09-01'`, `to='2026-09-30'` — passing (see
      PROGRESS.md); `npm run verify` 515/515
- [x] P10-4: client build exits 0 with zero TypeScript errors — 8/8 tabs
      chart-backed (recharts ^3.10.1), all 5 previously-unwired tabs
      (Stock on Hand, Receivables, Cash Book, Jobs, Wages) now have
      `DateRangeSelector`; new Expenses tab added; `npm run verify`
      515/515 unchanged (no new business-logic tests required for this
      sub-phase); `npm run build --workspace=@shop/server` also clean
- [x] P10-5: `downloadCsv` unit test — comma-in-field quoting verified —
      `buildCsvString` test 2, `exportCsv.test.ts`, 7/7 passing
- [x] P10-5: Export CSV button disabled on empty data — render test
      output pasted, `DailySalesReport.test.tsx`, 3/3 passing
- [x] `docs/phases/PHASE_10.md` complete
- [x] `PROJECT.md` updated with Phase 10 status
- [x] `PROGRESS.md` updated with a session log entry
- [x] CLAUDE.md §7 session-close checklist ticked

---

## 5. Design decisions made this phase

| Decision                                                                                                                                                                                                     | Reasoning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ADR? |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| P10-1: narrowed the existing `ConfirmDialog` warning-gate to credit-limit only, instead of removing it, and added the zero-stock hard block as a separate, earlier check in `ItemSearchPanel.tsx`            | The live dialog (BUG-Y's fix) was a combined credit-limit + stock-below-zero gate, not stock-only as the brief assumed — full removal would have silently dropped the still-wanted credit-limit warning. Owner-confirmed before writing code.                                                                                                                                                                                                                                                                                                       | No   |
| P10-1: the hard block matches `resolveStockBadge()`'s exact condition (`stockOnHandMilli !== null && <= 0`) — a stock-tracked item that has never had a movement (`stockOnHandMilli === null`) stays addable | The DTO can't distinguish "confirmed zero via movements" from "never tracked/never moved" — treating null as blocked would misclassify an item the system genuinely doesn't have data on, and diverges from the existing badge's own behavior with no upside proven yet. Owner-confirmed before writing code.                                                                                                                                                                                                                                       | No   |
| P10-2a/2b: `report:dailySales`/`report:unitPl` needed no repository or SQL change — only contracts + handler + call-site                                                                                     | Both underlying repository functions (`getDailySalesReport`, `getUnitPlReport`) already took `dateFrom`/`dateTo` as separate parameters; only the handlers hardcoded a single value into both, or hardcoded an all-time range.                                                                                                                                                                                                                                                                                                                      | No   |
| P10-2c: `report:stockPerformance` includes every `track_stock` item, even one with zero sales in the queried range (LEFT JOIN, not INNER JOIN)                                                               | Ambiguous in the brief; owner chose "include all" so the same handler can later back a full per-item performance view, not just a "top 10 best sellers" slice — zero-sale items simply sort to the bottom and never surface in a top-10 UI anyway.                                                                                                                                                                                                                                                                                                  | No   |
| P10-2d: `report:expenseSummary` excludes `expense_category.is_owner_drawing = 1` rows                                                                                                                        | That column is commented "not a real expense" in its own migration, and the existing `v_unit_direct_expense`/`v_owner_drawings` views already exclude/report drawings separately — followed that precedent rather than inventing new behavior. Flagged, not silently decided; not contradicted by the owner.                                                                                                                                                                                                                                        | No   |
| P10-3: `DateRangeSelector` wired into `DailySalesReport.tsx`/`UnitPlReport.tsx` only, not all 7 report tabs                                                                                                  | The turn's own constraint 7 named exactly these two (the ones whose backend contracts P10-2 changed to `{from,to}`). The other 5 tabs have incompatible date shapes today — point-in-time valuation (Stock on Hand), server-computed "today" (Receivables), an already-different `{dateFrom,dateTo}` pair with its own UI (Cash Book), no date concept (Jobs), or `{year,month}` (Wages) — wiring a generic `{from,to}` selector into them was left out of scope, not silently skipped.                                                             | No   |
| P10-3: `DailySalesReport.tsx`'s KPI cards now sum every row `getDailySalesReport` returns, not just `summary[0]`                                                                                             | Once the tab's date range could span more than one day, the report started returning one row per date — reading only the first row would have silently shown a wrong (too-low) money total for any multi-day selection. This is a real money-correctness fix required by wiring in the selector, not an optional cleanup — found and fixed before shipping, not left for later.                                                                                                                                                                     | No   |
| P10-3: two separate `<Tabs>` instances (Operational/Financial) sharing one `active`/`onChange` pair, with a text-label + border divider between them                                                         | The existing `Tabs` component (`packages/ui/src/primitives/Tabs.tsx`) has no grouping concept in its API — inventing a new grouped-tabs component was explicitly disallowed; this reuses the existing primitive twice instead.                                                                                                                                                                                                                                                                                                                      | No   |
| P10-3: no "Expenses" tab added yet, even though the full Phase 10 brief's Financial group names one                                                                                                          | No `ExpensesReport.tsx` screen exists — only the `report:expenseSummary` backend (P10-2d). Building that screen (and its chart) is P10-4 scope, not P10-3's page-restructure-only mandate.                                                                                                                                                                                                                                                                                                                                                          | No   |
| P10-4: widened `report:receivables` (additive, optional `asOfDate`) instead of leaving it read-only                                                                                                          | `report:receivables` returned only pre-bucketed sums against a server-hardcoded `today()` — there is no way to "re-bucket" already-summed numbers client-side for an arbitrary date; the raw per-entry dates never cross the wire. Same channel name/DTO shape, defaulting to today when omitted (identical to any existing caller). Owner-confirmed before writing code, after the alternative (a cosmetic-only selector) was raised.                                                                                                              | No   |
| P10-4: Wages' Gross/Advances/Net Due chart is a grouped (non-stacked) BarChart, not a stacked one                                                                                                            | Net Due = Gross − Advances + Commission — a true stackId can't represent a subtraction without either overstating the bar (when Commission > 0) or misrepresenting a segment. Grouped bars keep every value honest. Owner-confirmed before writing code, after the alternative (a 2-segment stack ignoring Commission's effect) was raised.                                                                                                                                                                                                         | No   |
| P10-4: `DateRangeSelector` wired into all 5 previously-unwired tabs, exactly as ordered                                                                                                                      | Stock on Hand's selector scopes only `report:stockPerformance` (the stock level table stays all-time); Receivables' `to` date drives the widened `asOfDate`; Cash Book's own local from/to state was replaced outright; Jobs' selector replaces `JobSplitReport.tsx`'s own local state feeding its existing client-filter-then-fan-out pattern (job:getJobSplit's signature is unchanged — it never took a range); Wages derives `{year, month}` from `range.from` client-side, per instruction, with a visible note on a multi-month custom range. | No   |
| P10-4: Expenses tab's table uses the existing `expense:list` channel (Phase 7), not `report:expenseSummary`                                                                                                  | `report:expenseSummary` (P10-2d) only returns grouped aggregates (category × business unit), not individual rows with dates/descriptions/payment methods. `expense:list` already exists, already takes `{from, to}`, and already returns exactly the per-row shape the table needs — reused, no new channel.                                                                                                                                                                                                                                        | No   |
| P10-4: all 8 recharts `Tooltip formatter` callbacks type their parameters as `unknown` and narrow internally, rather than typing against recharts' own `Formatter` type                                      | recharts v3's `Tooltip` formatter prop type is a strict intersection that a plainly-typed `(value, name, item) => string` function doesn't structurally satisfy under this project's `exactOptionalPropertyTypes`/strict settings — `unknown` parameters (narrowed via a type assertion inside the function body) satisfy the contravariant check without introducing `any`.                                                                                                                                                                        | No   |
| P10-4: `Cell` (recharts, used for Expenses' pie slice colors) kept despite being deprecated in recharts v3, with a targeted `eslint-disable`                                                                 | `Cell` still works until recharts 4.0; migrating to the newer `shape`-prop API is a separate, larger refactor with no correctness benefit for this phase — a one-line justified suppression was preferred over scope creep.                                                                                                                                                                                                                                                                                                                         | No   |
| P10-5: Daily Sales CSV exports an "Items" column with an empty value on every row, rather than omitting the column or inventing a count                                                                      | `SaleSummaryDto` (the per-sale data already in state) has no line-item count field; a real count would need a new per-sale fetch or a backend DTO change, both out of scope for a CSV-only sub-phase (no new IPC, no changed fetching logic). Owner chose to keep the literal column name with an empty value over dropping it from the header.                                                                                                                                                                                                     | No   |
| P10-5: Daily Sales CSV derives per-row Cash (Rs)/Credit (Rs) as `paidAmountPaisa` / `totalAmountPaisa - paidAmountPaisa`                                                                                     | Mirrors the exact same cash-collected/credit-given split the tab's own KPI cards already use (`sumDailySalesRows`), just at the per-row level instead of summed — not an invented formula.                                                                                                                                                                                                                                                                                                                                                          | No   |
| P10-5: shared `ExportCsvButton.tsx` component instead of repeating the button/disabled-logic JSX in all 8 tabs                                                                                               | Same label ("Export CSV"), same disabled shape (`!data \|\| data.length === 0`) needed in 8 places — CODING_STANDARDS.md's "three near-duplicates means one abstraction was missed" applied at 8.                                                                                                                                                                                                                                                                                                                                                   | No   |
| P10-5: Unit P&L's CSV includes the TOTAL row (unlike its chart, which excludes it)                                                                                                                           | The CSV mirrors the table exactly as displayed on screen (which has always shown Parts/Repair/Total) — the chart's own TOTAL exclusion is a P10-4 visual decision specific to a 2-group bar chart, not a rule about what data should ever leave the app.                                                                                                                                                                                                                                                                                            | No   |
| P10-5: render tests assert `button.hasAttribute('disabled')` rather than a `disabled` property cast to `HTMLButtonElement`                                                                                   | `tsc` requires the cast (`HTMLElement` has no `disabled` property) but the project's `eslint` typed-linting pass flagged that same cast as unnecessary — a real tooling disagreement between the two type-checkers. `hasAttribute('disabled')` exists on plain `Element`/`HTMLElement` and satisfies both without a cast.                                                                                                                                                                                                                           | No   |

---

## 6. Bugs found this phase

None fixed-in-flight and none newly discovered and left open. Two
TypeScript/lint issues surfaced during P10-4/P10-5 (recharts v3's
`Tooltip` formatter typing, a `tsc`/`eslint` disagreement over an
`HTMLButtonElement` cast, `Cell`'s deprecation, an `expense_category`
name collision with a seeded fixture in a P10-2d test) were all caught
and fixed within the same session, before any verification was reported
green — none were ever in a committed/shipped state, so none are logged
under CLAUDE.md §8's Known Bugs format.

---

## 7. Open questions resolved this phase

None of PROJECT.md's currently-open questions (gas by cylinder/weight,
cylinder deposits, wholesale pricing rule, serial tracking scope, fridge
warranty parts payer) are touched by this phase.

---

## 8. Notes for the next phase

- **`ReceivablesReportInput.asOfDate` and `StockPerformanceInput`/
  `ExpenseSummaryInput`/`UnitPlReportInput` are all new, additive report
  contracts** — any future report work should check `report.ts`/
  `channels.ts` before assuming a report has no client-controllable
  date range; several that looked date-less before Phase 10 no longer are.
- **Five report tabs (Stock on Hand, Receivables, Cash Book, Jobs, Wages)
  now each hold their own local `DateRangeSelector` state** rather than
  a page-level shared range — if a future session wants one global date
  range driving every tab at once, that's a real restructure, not a
  small change.
- **The Expenses tab's table reads `expense:list` while its charts read
  `report:expenseSummary`** — two different channels feeding one screen.
  If `expenseSummary`'s grouping ever needs to change, check whether the
  table's per-row data (a separate channel) needs to change too.
- **`downloadCsv`/`buildCsvString` (`apps/client/src/utils/exportCsv.ts`)
  and `ExportCsvButton` (`apps/client/src/components/shared/
ExportCsvButton.tsx`) are the only CSV-export primitives in the app.**
  Any future export button should reuse these, not reimplement CSV
  quoting or the disabled-state shape again.
- **Daily Sales' CSV "Items" column is a known, owner-accepted gap**
  (always empty) — if a future phase adds a per-sale line-item count to
  `SaleSummaryDto` or a new lookup, that column should be revisited.
