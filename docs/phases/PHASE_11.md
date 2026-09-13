# Phase 11 — Reports UI Polish & Navigation Redesign

**Status:** NOT STARTED — pre-code audit (P11-0) complete, awaiting P11-1
**Started:** 2026-09-13
**Completed:** —
**Branch:** main
**Last commit:** 27ea374 (Phase 9-CSV) — Phase 10's own work still uncommitted; this phase's work not yet started

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

| ID     | Task                                                                      | Status      | Commit |
| ------ | ------------------------------------------------------------------------- | ----------- | ------ |
| P11-0  | Environment check — audit only, no code                                   | DONE        | —      |
| P11-1  | Sidebar expandable Reports nav group                                      | NOT STARTED | —      |
| P11-2  | Terminology rename (renderer-only)                                        | NOT STARTED | —      |
| P11-3  | Shared `Pagination` component + wire into all long tables                 | NOT STARTED | —      |
| P11-4a | New handler `report:periodComparison`                                     | NOT STARTED | —      |
| P11-4b | New handler `report:itemSoldSummary`                                      | NOT STARTED | —      |
| P11-5  | Sales tab visual redesign (6 sections, sparklines, trend, item summary)   | NOT STARTED | —      |
| P11-6  | Remaining 7 tabs — visual polish, pagination, plain language, chart fixes | NOT STARTED | —      |

---

## 4. Exit criteria

- [ ] `npm run verify` exits 0 — final test count pasted (baseline: **525/525**,
      confirmed this session after fixing an unrelated environment issue —
      see §7)
- [ ] `npm run build --workspace=@shop/client` exits 0
- [ ] `npm run build --workspace=@shop/server` exits 0
- [ ] P11-1: sidebar shows "Daily Reports" and "Accounts" sub-items — render
      test output pasted
- [ ] P11-1: collapsed sidebar hides sub-item labels — render test output
      pasted
- [ ] P11-2: grep confirms no old terminology in display strings — zero hits
      pasted
- [ ] P11-3: Pagination render tests (3 cases) — pasted
- [ ] P11-4a: `periodComparison` returns correct current/previous arrays —
      hand-calculated test pasted
- [ ] P11-4b: `itemSoldSummary` returns items sorted by revenue, labour lines
      excluded — test output pasted
- [ ] P11-5: Sales tab has all 6 sections visually separated — confirmed by
      build exit 0
- [ ] P11-5: active preset button is highlighted — confirmed by className
      diff in code
- [ ] P11-5: sparklines use `isAnimationActive={false}`
- [ ] P11-6: all remaining tabs have paginated tables
- [ ] P11-6: negative inventory valuation shows "—" guard
- [ ] All tab components under 300 lines — list pasted
- [ ] `docs/phases/PHASE_11.md` complete
- [ ] `PROJECT.md` updated (including future feature note: "rows per page
      configurable from Settings")
- [ ] `PROGRESS.md` updated
- [ ] CLAUDE.md §7 session-close checklist ticked

---

## 5. Design decisions made this phase (pre-code, owner-confirmed)

| Decision                                                                                                                                                                                                                                                               | Reasoning                                                                                                                                                                                                                                  | ADR? |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| No router exists (`App.tsx` is a plain `useState<Tab>` switch, no URL) — Reports group expand/active-sub-item state is modeled as new plain React state/props through `App.tsx`, not a URL                                                                             | Brief assumed a router to read from; none exists. Introducing one now would be a bigger architectural change than this phase calls for. Owner-confirmed before writing code.                                                               | No   |
| Stock on Hand's "Best Performers" table drops its existing client-side `.slice(0, 10)` cap so the full `report:stockPerformance` result (every `track_stock` item, zero-sale ones included, per P10-2c) is shown, paginated                                            | As found, the table could never exceed 10 rows, so adding `Pagination` to it as literally specified would never render a second page. Owner-confirmed: paginate the full list rather than leave this one table's pagination cosmetic-only. | No   |
| The sidebar's new per-group expand/collapse state uses a distinct name and localStorage key from the existing whole-sidebar width toggle (also internally called "expanded")                                                                                           | The two are different axes — collapsing the Reports group must not collapse or interact with the 56px/200px sidebar-width toggle. Reusing the same name would be confusing and bug-prone.                                                  | No   |
| `report:itemSoldSummary`'s join path follows the existing `getStockPerformanceReport` (P10-2c) precedent exactly: `item ⋈ uom ON stock_uom_id ⋈ sale_line ⋈ sale`, using `item.name_en` (not `item.name`) and `uom` (not `unit_of_measure` — that table doesn't exist) | Confirmed by reading the live schema (`0001_init.sql`, `0011_sale_line_item_optional.sql`) rather than assuming the brief's table/column names.                                                                                            | No   |

---

## 6. Bugs found this phase

None yet — pre-code audit only so far.

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

## 8. Notes for the next phase

- (to be filled in as P11-1 through P11-6 are completed)
