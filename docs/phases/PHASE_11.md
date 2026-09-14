# Phase 11 — Reports UI Polish & Navigation Redesign

**Status:** COMPLETE — all sub-phases (P11-0 through P11-6) done and verified
**Started:** 2026-09-13
**Completed:** 2026-09-14
**Branch:** main
**Last commit:** f7de26a (feat(report): Phase 10 — reports redesign, date ranges, charts, CSV export, zero-stock hard block) — this phase's own work not yet committed

---

## 1. Goal

The owner opens the sidebar and finds Reports as an expandable group ("Daily
Reports" / "Accounts") instead of a single flat tab, matching the shop's own
mental model of "day-to-day stuff" vs "the money stuff." Every report screen
uses plain, owner-approved language with no developer terms anywhere visible.
Every table that can grow past 10 rows is paginated with a shared, reusable
component. Every summary card on the Sales tab shows a trend arrow and a tiny
sparkline so the owner can tell "better or worse than last time" at a glance,
without reading numbers. The Sales tab additionally shows what was actually
sold in the period (item-by-item), not just per-invoice totals.

---

## 2. Scope

### In scope

- P11-1: Sidebar "Reports" nav item becomes an expandable group with two
  sub-items ("Daily Reports", "Accounts"); expand state persists via
  localStorage; auto-expands + highlights the correct sub-item when on a
  Reports sub-page. No router exists in this app (`App.tsx` is a plain
  `useState<Tab>` switch) — modeled as new plain React state/props threaded
  through `App.tsx`, not a URL (owner-confirmed).
- P11-2: Renderer-only terminology rename to the owner-approved plain-language
  strings, applied to every user-facing string in the reports UI.
- P11-3: A new shared `Pagination.tsx` component (`ROWS_PER_PAGE = 10`
  constant per file) applied to every table that can exceed 10 rows.
- P11-4a: New `report:periodComparison` IPC channel — current vs. previous
  period `DayBucket[]` pairs, powering Sales-tab sparklines/trend indicators.
  `getPreviousPeriod()` added to `dateRanges.ts`.
- P11-4b: New `report:itemSoldSummary` IPC channel — per-item sold summary
  for a date range, sorted by revenue DESC, excluding labour lines
  (`sale_line.item_id IS NOT NULL`).
- P11-5: Sales tab visual redesign into 6 clearly separated sections,
  including the new item-sold-summary table and sparkline/trend cards.
- P11-6: Visual polish pass (section separation, active-preset highlighting,
  pagination, plain language) on the remaining 7 report tabs, plus specific
  fixes: Jobs chart stacked → grouped; negative inventory valuation display
  guard; Stock on Hand's Best Performers table drops its top-10 cap so it can
  actually be paginated (owner-confirmed — see Discrepancy #6 below).

### Explicitly out of scope

- Balance sheet — not built, not stubbed.
- Any new nav item beyond the Reports sub-group.
- `periodComparison`/sparklines for any tab other than Sales.
- Any schema migration.
- Any IPC channel beyond `report:periodComparison` and `report:itemSoldSummary`.
- Fixing any bug outside this phase's own tasks (logged in PROJECT.md instead).
- A Settings-driven `ROWS_PER_PAGE` — stays a per-file constant this phase;
  logged as a future feature in PROJECT.md.

---

## 3. Tasks

| ID     | Task                                                                      | Status | Commit |
| ------ | ------------------------------------------------------------------------- | ------ | ------ |
| P11-0  | Environment check — audit only, no code                                   | DONE   | —      |
| P11-1  | Sidebar expandable Reports nav group                                      | DONE   | —      |
| P11-2  | Terminology rename (renderer-only)                                        | DONE   | —      |
| P11-3  | Shared `Pagination` component + wire into all long tables                 | DONE   | —      |
| P11-4a | New handler `report:periodComparison`                                     | DONE   | —      |
| P11-4b | New handler `report:itemSoldSummary`                                      | DONE   | —      |
| P11-5  | Sales tab visual redesign (6 sections, sparklines, trend, item summary)   | DONE   | —      |
| P11-6  | Remaining 7 tabs — visual polish, pagination, plain language, chart fixes | DONE   | —      |

---

## 4. Exit criteria

- [x] `npm run verify` exits 0 — final test count pasted (baseline: **525/525**,
      confirmed after fixing an unrelated environment issue — see §6; **541/541**
      through P11-6, unchanged since P11-4b — both P11-5 and P11-6 are
      visual, no new business-logic tests required)
- [x] `npm run build --workspace=@shop/client` exits 0 (checked after every
      one of P11-5's 6 build steps, after each of P11-6's 7 tabs, plus
      after P11-2/P11-3)
- [x] `npm run build --workspace=@shop/server` exits 0 (checked after
      P11-4a/P11-4b and again at final P11-6 close-out)
- [x] P11-1: sidebar shows "Daily Reports" and "Accounts" sub-items — render
      test output pasted (`Sidebar.test.tsx`, 2/2 passing)
- [x] P11-1: collapsed sidebar hides sub-item labels — render test output
      pasted (JS hover/focus-driven flyout, genuinely absent from the DOM
      until interacted with, not just CSS-hidden)
- [x] P11-2: grep confirms no old terminology in display strings — zero hits
      pasted (one remaining hit is a `//` comment, correctly left untouched)
- [x] P11-3: Pagination render tests (3 cases, +3 more: Previous/Next/page
      click) — all 6 pasted, passing
- [x] P11-4a: `periodComparison` returns correct current/previous arrays —
      hand-calculated test pasted (3 tests: 500,000/150,000 paisa split,
      empty-period, cash/credit split)
- [x] P11-4b: `itemSoldSummary` returns items sorted by revenue, labour lines
      excluded — test output pasted (4 tests, including the labour-line
      zero-effect assertion)
- [x] P11-5: Sales tab has all 6 sections visually separated — each wrapped
      in its own `Card` (Summary, Sales Trend, Cash vs Credit, What Was
      Sold, Transactions) plus the date-selector/export row; build exit 0
- [x] P11-5: active preset button is highlighted — confirmed by className
      diff in code (`ACTIVE_BUTTON_CLASS` filled brand/white vs.
      `INACTIVE_BUTTON_CLASS` bordered/muted) — fixed for all 8 report tabs
      at once, since they share one `DateRangeSelector`
- [x] P11-5: sparklines use `isAnimationActive={false}` — grep pasted,
      every `Line`/`Pie` across the 3 new chart sub-components has it
- [x] P11-6: all remaining tabs have paginated tables — confirmed by
      `ROWS_PER_PAGE` grep across every tab file (Stock, Udhaar, Jobs,
      Cash Record, Wages, Expenses — all present and already wired since
      P11-3; Business Profit's table is always exactly 3 rows, correctly
      excluded)
- [x] P11-6: negative inventory valuation shows "—" guard — `InventoryValue`
      component in `StockValuationReport.tsx`, shows "—" + "Contains
      invalid stock data." when `totalValuationPaisa < 0`, display-only
- [x] All tab components under 300 lines — list pasted (largest overall:
      `ReceivablesAgingReport.tsx` at 288 lines; `StockValuationReport.tsx`
      dropped from 304 back to 245 after extracting `BestPerformersTable.tsx`,
      79 lines, once the negative-valuation guard pushed it over the cap)
- [x] `docs/phases/PHASE_11.md` complete — this update closes out P11-6 and
      the whole phase
- [x] `PROJECT.md` updated (including future feature note: "rows per page
      configurable from Settings", added in the P11-3 session)
- [x] `PROGRESS.md` updated
- [x] CLAUDE.md §7 session-close checklist ticked (given in full to the
      owner in the P11-6 close-out reply, covering the entirety of Phase 11)

---

## 5. Design decisions made this phase (pre-code, owner-confirmed)

| Decision                                                                                                                                                                                                                                                               | Reasoning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ADR? |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| No router exists (`App.tsx` is a plain `useState<Tab>` switch, no URL) — Reports group expand/active-sub-item state is modeled as new plain React state/props through `App.tsx`, not a URL                                                                             | Brief assumed a router to read from; none exists. Introducing one now would be a bigger architectural change than this phase calls for. Owner-confirmed before writing code.                                                                                                                                                                                                                                                                                                                                                                            | No   |
| Stock on Hand's "Best Performers" table drops its existing client-side `.slice(0, 10)` cap so the full `report:stockPerformance` result (every `track_stock` item, zero-sale ones included, per P10-2c) is shown, paginated                                            | As found, the table could never exceed 10 rows, so adding `Pagination` to it as literally specified would never render a second page. Owner-confirmed: paginate the full list rather than leave this one table's pagination cosmetic-only.                                                                                                                                                                                                                                                                                                              | No   |
| The sidebar's new per-group expand/collapse state uses a distinct name and localStorage key from the existing whole-sidebar width toggle (also internally called "expanded")                                                                                           | The two are different axes — collapsing the Reports group must not collapse or interact with the 56px/200px sidebar-width toggle. Reusing the same name would be confusing and bug-prone.                                                                                                                                                                                                                                                                                                                                                               | No   |
| `report:itemSoldSummary`'s join path follows the existing `getStockPerformanceReport` (P10-2c) precedent exactly: `item ⋈ uom ON stock_uom_id ⋈ sale_line ⋈ sale`, using `item.name_en` (not `item.name`) and `uom` (not `unit_of_measure` — that table doesn't exist) | Confirmed by reading the live schema (`0001_init.sql`, `0011_sale_line_item_optional.sql`) rather than assuming the brief's table/column names.                                                                                                                                                                                                                                                                                                                                                                                                         | No   |
| P11-1: Reports sidebar's collapsed-mode (56px) sub-item flyout is JS hover/focus-state-driven (`useState` + `onMouseEnter`/`onFocus`), not pure CSS `group-hover`                                                                                                      | jsdom doesn't apply real stylesheets, so a CSS-only `hidden`/`group-hover:flex` class can't be asserted as "not shown" by a render test. JS-driven state makes the sub-items genuinely absent from the DOM until interacted with, and testable.                                                                                                                                                                                                                                                                                                         | No   |
| P11-1: the Reports group's own expand/collapse auto-opens once on arrival (a one-time transition effect on `activeTab` changing to `'reports'`), not a continuous `expanded \|\| activeTab === 'reports'` OR                                                           | The OR form would make a manual collapse-while-on-Reports click a no-op for as long as the owner stayed on any Reports tab — defeating the point of a collapse button. Owner-confirmed before writing code.                                                                                                                                                                                                                                                                                                                                             | No   |
| P11-1: `ReportsPage` and `App.tsx`/`Sidebar` sync the active Reports group in both directions via a ref-guarded pair of `useEffect`s (`lastKnownGroupRef`), not a naive prop-down/callback-up pair                                                                     | A naive version would either reset the visible tab to the group's first tab every time the owner clicked a tab directly inside `ReportsPage` (clobbering their choice), or never fire the required callback on mount. The ref distinguishes "this activeGroup change came from the sidebar" (reset tab) from "this component itself just reported it up" (don't reset).                                                                                                                                                                                 | No   |
| P11-3: Stock on Hand's Best Performers table drops its top-10 cap (implemented) — full `report:stockPerformance` result shown, paginated                                                                                                                               | Confirms the P11-0 pre-code decision above was carried through, not just agreed to abstractly.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | No   |
| P11-4a: `getPeriodComparisonReport` calls `getDailySalesReport` twice (via `Promise.all`) and maps rows to `DayBucket`, rather than a second hand-written SQL query against `v_daily_sales`                                                                            | `v_daily_sales` already has every column `DayBucket` needs (`cash_collected_paisa`/`credit_given_paisa` map directly to `cashPaisa`/`creditPaisa`) — reusing the proven query means there is exactly one place that ever queries that view for daily figures. `Promise.all` on two calls sharing one better-sqlite3 connection is safe because better-sqlite3 has no async I/O: each call fully completes synchronously before the next begins, so there's no real concurrency to reason about, only two sequential reads with no shared mutable state. | No   |
| P11-4b: `report:itemSoldSummary` filters `s.status = 'confirmed'`                                                                                                                                                                                                      | Not stated in the original brief; follows the existing `getStockPerformanceReport` revenue-subquery precedent (P10-2c) so a cancelled sale's `sale_line` rows (which still physically exist) never inflate these figures. Owner-confirmed before writing code.                                                                                                                                                                                                                                                                                          | No   |
| P11-5: `DateRangeSelector`'s active preset is derived by comparing `value` against what each preset would compute right now, not tracked via a new `activePreset` prop                                                                                                 | Reuses the same `compute(referenceDate ?? new Date())` call each button's own `onClick` already makes — needs zero interface change and therefore zero caller updates across the other 7 report tabs, while also fixing the highlight on all 8 tabs at once (they share one component) instead of only Sales. Verified afterward: the grep of every caller is byte-identical before and after. Owner-confirmed before writing code.                                                                                                                     | No   |
| P11-5: the three parallel IPC calls are `sale.listByDate` + `report.periodComparison` + `report.itemSoldSummary` — not `report.dailySales` + `report.periodComparison` + `report.itemSoldSummary` as the brief's own pseudocode showed                                 | `report:dailySales` and `periodComparison.current` return the same day-bucket data from the same underlying query (just renamed fields) — calling both would fetch identical information twice. Section 6's Transactions table needs per-invoice fields (`docNo`/`customerId`/`paymentMode`) that only `sale.listByDate` provides and `report:dailySales` never has. Owner-confirmed before writing code.                                                                                                                                               | No   |
| P11-5: Cash vs Credit pie uses `colors.money.in`/`colors.money.due`, not `colors.success`/`colors.warning`                                                                                                                                                             | Cash/Credit are money concepts ("received"/"outstanding"), and `colors.ts`'s own comment says the money vocabulary is kept deliberately distinct from the UI-state vocabulary. Matches the tone `MoneyDisplay tone="in"`/`tone="due"` already use for these same two concepts elsewhere in this file. Owner-confirmed before writing code.                                                                                                                                                                                                              | No   |
| P11-5: `SalesTrendChart` enumerates every UTC calendar day in each period (not just the sparse dates `v_daily_sales` returns) and looks up each day's bucket by date, 0 if none                                                                                        | `v_daily_sales` only returns dates with at least one confirmed sale, so `current`/`previous` are sparse and not the same length as each other on their own. Enumerating full calendar days per period (using each period's actual `{from, to}`, not a value inferred from bucket contents) produces two full, gap-free, identical-length series with the previous-period line correctly time-shifted onto the current period's date axis. Owner-confirmed before writing code.                                                                          | No   |
| P11-6: `BestPerformersTable` extracted out of `StockValuationReport.tsx` into its own file mid-tab, not planned in the pre-code audit                                                                                                                                  | The pre-code line-count estimate for Stock's negative-valuation guard (+~10 lines) undershot — the actual file landed at 304 lines, 4 over the cap, once Prettier reformatted the new JSX. Caught immediately by the post-tab `wc -l` check (part of the brief's own per-tab verification), fixed before moving to tab 2.                                                                                                                                                                                                                               | No   |
| P11-6: Jobs tab's grouped `BarChart` gained a `<Legend />` (not explicitly requested)                                                                                                                                                                                  | Two side-by-side bars per job are harder to tell apart by color alone than a stacked bar was — every other multi-`Bar` chart in this codebase (`UnitPlReport.tsx`, `WageMonthReport.tsx`) already uses `Legend` for the same reason. Directly supports the stated goal ("the owner can compare per job which earned more from parts vs labour").                                                                                                                                                                                                        | No   |
| P11-6: Wages' "Showing wages for [Month Year]…" note is now always rendered (color-coded amber only when the range spans multiple months), not conditionally rendered only for multi-month ranges as it was before this phase                                          | The brief asked for an always-visible note; keeping the existing multi-month case as a distinct color (rather than adding a second, separate line) avoids showing two near-duplicate messages when a custom range does span months.                                                                                                                                                                                                                                                                                                                     | No   |

---

## 6. Bugs found this phase

None found in P11-1 through P11-6 — each sub-phase's own `npm run verify`/
`npm run build` was green before moving to the next. Two small issues
surfaced and fixed within the same step they were found, neither carried
forward: (1) P11-5 — a pre-existing test's mock needed updating
(`DailySalesReport.test.tsx` still mocked the now-removed
`ipc.report.dailySales` call after the orchestrator rewrite), caught by
the first post-rewrite `npm run verify`. (2) P11-6 — `StockValuationReport.tsx`
landed 4 lines over the 300-line cap after the negative-valuation guard
(a line-count estimate that undershot), caught by the per-tab `wc -l`
check and fixed by extracting `BestPerformersTable.tsx` before moving to
the next tab.

**Environment issue found and fixed before any code was written (not a code
bug, logged here for the record):** `npm run verify`'s test step failed
274/525 tests at session start, entirely due to `better-sqlite3`'s native
binary being compiled against `NODE_MODULE_VERSION 130` while the Node
running tests required `127` (the same class of issue previously logged and
resolved as BUG-7). Root cause was a stale locked `.node` file held open by
4 leftover `electron.exe` processes from prior sessions; owner-confirmed to
kill those processes, then `npm rebuild better-sqlite3` succeeded. Baseline
re-confirmed clean immediately after: 90 test files, 525/525 passing,
typecheck and lint both exit 0.

---

## 7. Open questions resolved this phase

None of PROJECT.md's currently-open questions (gas by cylinder/weight,
cylinder deposits, wholesale pricing rule, serial tracking scope, fridge
warranty parts payer) are touched by this phase.

---

## 8. Notes for the next phase (Phase 11 is now closed)

- **`report:dailySales` now has zero client call sites** — P11-5's
  `DailySalesReport.tsx` rewrite replaced its only caller with
  `report:periodComparison` (whose `current` array is a superset of the
  same information). The channel/handler/repository function are all still
  fully wired and tested; nothing calls them anymore. Same
  `DEBT-2`/`DEBT-3`-shaped situation as before, just for a different
  channel — worth a PROJECT.md Known-Bugs-style note if a future cleanup
  pass looks for dead IPC surface.
- **The Reports sidebar's group-sync logic (`ReportsPage`'s `activeGroup`/
  `onActiveGroupChange` props, `lastKnownGroupRef`)** is the only place in
  the app with this two-way-sync-without-clobbering pattern — if a future
  phase adds more sidebar sub-groups elsewhere, read `ReportsNavItem.tsx`
  and `ReportsPage.tsx`'s P11-1 comments first rather than inventing a
  different mechanism.
- **Best Performers (Stock tab) now shows the full `report:stockPerformance`
  result, paginated** — it is no longer a "top 10" in name only; anything
  reading that table's row count elsewhere should not assume ≤10.
- **`DateRangeSelector`'s active-preset highlighting is now live on all 8
  report tabs**, not just Sales — a side effect of fixing it without a new
  prop. P11-6's own to-do list named this as a per-tab fix; it's already
  done everywhere as of P11-5.
- **The five extracted Sales-tab/Stock-tab sub-components (`SalesSummaryCards.tsx`,
  `SalesTrendChart.tsx`, `CashCreditPie.tsx`, `ItemsSoldTable.tsx`,
  `BestPerformersTable.tsx`) all live in `apps/client/src/pages/reports/`**
  alongside the tab files, not in a nested subfolder — consistent with this
  directory's existing flat layout (e.g. `JobSplitReport.tsx`/
  `TechnicianCustodySummary.tsx` under `JobsReport.tsx`). Any future
  extraction should follow the same flat placement.
- **Two owner-approved wording discrepancies worth knowing about**: (1) the
  Udhaar tab's summary card and footer both read "Total Udhaar (Who Owes
  Me)" (the exact P11-2 terminology-table wording), not the shorter "Total
  Udhaar" this phase's own P11-6 brief text used when describing the
  already-done change — the longer form was what P11-2 actually
  implemented and approved, so it was left as-is rather than shortened
  based on a summary sentence. (2) Jobs' grouped bar chart gained a
  `Legend` not explicitly requested — see §5.
- **`DEBT-4`** (`report:dailySales` has zero client call sites, logged
  during P11-5) **is still open** — Phase 11 closing does not resolve it;
  it needs a dedicated backend-touching session per its own PROJECT.md
  entry.
- **Phase 11 is fully closed.** The next phase should read PROJECT.md's
  "Open Questions" section and `docs/PHASES.md` for what's next — nothing
  in Phase 11's own scope was deferred to a later phase except `DEBT-4`
  above (a cleanup item, not a feature gap).
