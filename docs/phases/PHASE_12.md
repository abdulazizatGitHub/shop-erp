# Phase 12 — Reports Visual Structure & Chart Additions

**Status:** COMPLETE — all sub-phases (P12-0 through P12-7) done and verified
**Started:** 2026-09-14
**Completed:** 2026-09-14
**Branch:** main
**Last commit:** c356957 (docs: add Phase 11 entry to PHASES.md) — this phase's own work not yet committed

---

## 1. Goal

Every report tab has the same visual structure: each logical section is its
own rounded white card with a subtle shadow, sitting on a light-grey page
background, matching the shop-management app's other redesigned pages
(Suppliers, Items, Purchase Orders). Seven of the eight tabs get one or two
additional charts presenting existing data in a second visual format. No
backend change, no new IPC channel.

---

## 2. Scope

### In scope

- P12-0: Structural prerequisite fixes discovered in the pre-code audit —
  remove `ReportsPage.tsx`'s single shared outer `<Card>` wrapper (currently
  nests every tab's own cards inside a second card), apply `bg-surface-page`
  to the page's outer wrapper, and convert `DailySalesReport.tsx`'s 5 `<Card>`
  usages (from Phase 11) to the same new local card pattern the other 7 tabs
  will use, for visual consistency across all 8 tabs.
- P12-1: Stock tab — card-per-section + Stock Health donut + Best Performers
  horizontal bar chart.
- P12-2: Udhaar tab — card-per-section + per-customer stacked aging bar chart.
- P12-3: Jobs tab — card-per-section + Parts vs Labour donut.
- P12-4: Cash Record tab — card-per-section + Daily Cash Flow grouped bar chart.
- P12-5: Business Profit tab — card-per-section + Revenue vs Margin donut.
- P12-6: Wages tab — card-per-section + Wage cost by role donut.
- P12-7: Expenses tab — card-per-section only (existing 2 charts kept, no new chart).

### Explicitly out of scope

- Any new IPC channel, handler, or backend change (`apps/server/`,
  `packages/db/`, `packages/contracts/`, `packages/core/` untouched).
- Any change to the shared `packages/ui/src/primitives/Card.tsx` primitive —
  it stays exactly as-is; report tabs stop using it in favour of a local
  className pattern, so no other screen in the app is visually affected.
- Any schema migration, new business logic, or float arithmetic.
- Fixing any bug outside this phase's own tasks (logged in PROJECT.md instead).

---

## 3. Pre-code audit findings (2026-09-14)

- `packages/ui/src/tokens/colors.ts`: light-grey page token is
  `surface.page` (`#F2F4F7`, Tailwind `bg-surface-page`), white card token is
  `surface.default` (`#FFFFFF`, Tailwind `bg-surface`); these are already
  distinct. No shadow token exists — `shadow-sm` used directly, per brief.
- `DailySalesReport.tsx` (the brief's assumed reference) uses the shared
  `Card` primitive (`rounded-lg border border-line bg-surface p-4 shadow-sm`),
  not the brief's specified `rounded-2xl`/`p-6`/no-border. An existing,
  different pattern already used on `SuppliersPage.tsx`, `ItemsPage.tsx`,
  and `PurchaseOrdersPage.tsx` (`rounded-2xl bg-surface p-6 shadow-[...]`)
  matches the brief's literal spec — adopted as the new pattern for all 8
  report tabs (owner-confirmed).
- `ReportsPage.tsx:132` currently wraps every tab's entire content in one
  shared `<Card title={TAB_TITLES[tab]}>` — every tab's own section cards
  would otherwise render nested inside a second card. Removed as P12-0
  (owner-confirmed); the outer page wrapper becomes a plain `bg-surface-page`
  div instead.
- `ExpensesReport.tsx` has no card wrapper today (plain `border-t` divider
  divs) — P12-7 builds its 3-card structure from scratch.
- `report.handler.ts` baseline: **10** `ipcMain.handle` calls — confirmed
  unchanged (10) after the phase.
- `recharts` confirmed installed: `apps/client/package.json` →
  `"recharts": "^3.10.1"`.
- Baseline `npm run verify`: **92 test files / 541 tests passing, exit 0.**
- The brief's spec used non-existent tokens in two places, both substituted
  for the real equivalent: `text-ink-base` → `text-ink` (`colors.ink.default`
  is the real DEFAULT token; there is no `ink-base`), and `colors.ink.base`
  (Jobs donut "Labour Revenue" slice) → `colors.ink.default`, same reason.
- Several DTO field names named in the brief's prose didn't match the live
  contracts and were corrected from the actual `packages/contracts` types
  before writing code: Jobs' `partsMargPaisa`/`labourRevenuePaisa` are
  actually `partsMarginPaisa`/`labourChargePaisa`; Wages' `netDuePaisa` is
  actually `netPaisa`.

---

## 4. Tasks

| ID    | Task                                                                     | Status | Commit |
| ----- | ------------------------------------------------------------------------ | ------ | ------ |
| P12-0 | Remove ReportsPage.tsx outer Card, grey page bg, convert Sales tab cards | DONE   | —      |
| P12-1 | Stock tab — cards + Stock Health donut + Best Performers bar             | DONE   | —      |
| P12-2 | Udhaar tab — cards + per-customer stacked aging bar                      | DONE   | —      |
| P12-3 | Jobs tab — cards + Parts vs Labour donut                                 | DONE   | —      |
| P12-4 | Cash Record tab — cards + Daily Cash Flow bar                            | DONE   | —      |
| P12-5 | Business Profit tab — cards + Revenue vs Margin donut                    | DONE   | —      |
| P12-6 | Wages tab — cards + Wage cost by role donut                              | DONE   | —      |
| P12-7 | Expenses tab — cards only, no new chart                                  | DONE   | —      |

---

## 5. Exit criteria

- [x] `npm run verify` exits 0 — baseline 541/541; 565/565 after P12-0–P12-7
      (24 new tests: 6 new pure-function test files across the 5 new donuts/
      2 new bar charts, each covering slice/bucket construction and edge
      cases — no chart component itself is render-tested, see §6); **569/569
      after the BUG-27/BUG-28 close-out fixes** (4 more: 2 new `Sidebar.test.tsx`
      cases, 2 in a new `ReportsPage.test.tsx`)
- [x] `npm run build --workspace=@shop/client` exits 0 after every tab
      (checked after P12-0 and after each of P12-1 through P12-7 individually)
- [x] `npm run build --workspace=@shop/server` exits 0 (no-op, confirmed —
      zero backend files touched all phase)
- [x] `ReportsPage.tsx` outer wrapper uses `bg-surface-page` — confirmed:
      `flex min-h-full flex-col gap-6 bg-surface-page` (`ReportsPage.tsx:117`)
- [x] All 8 tabs (including Sales) use the new local card pattern — confirmed
      by grep: zero report tab files import the shared `Card` primitive
      (`grep -rn "from.*ui.*Card" apps/client/src/pages/reports/*.tsx`
      excluding `.test.tsx` → zero hits, including `ReportsPage.tsx` itself)
- [x] All new charts have `isAnimationActive={false}` — grep pasted in
      PROGRESS.md; per-file `Bar`/`Line`/`Pie` element counts cross-checked
      1:1 against `isAnimationActive` occurrence counts, every file matches
- [x] All files under 300 lines — full list in PROGRESS.md, largest is
      `ReceivablesAgingReport.tsx` at 297
- [x] Zero new IPC channels — `report.handler.ts` grep count still 10
- [x] `PROJECT.md` / `PROGRESS.md` updated
- [x] CLAUDE.md §7 checklist ticked (given in full in the close-out reply)

---

## 6. Design decisions made this phase (pre-code, owner-confirmed)

| Decision                                                                                                                                                                                                                                                                                                                                                                    | Reasoning                                                                                                                                                                                                                                                                                                                                                                                                                                                            | ADR? |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Remove `ReportsPage.tsx`'s shared outer `<Card>`; apply `bg-surface-page` to the outer wrapper instead                                                                                                                                                                                                                                                                      | Brief assumes independent cards sit directly on a grey background; live code nests every tab inside one shared card today. Leaving it would double-box every new section card.                                                                                                                                                                                                                                                                                       | No   |
| New section cards use a local `rounded-2xl bg-surface p-6 shadow-sm` className directly in each report tab file, not the shared `Card.tsx` primitive                                                                                                                                                                                                                        | Brief's exact spec doesn't match `Card.tsx`'s current classes (`rounded-lg`/`p-4`/bordered), and `Card.tsx` is used by other, out-of-scope screens. A local pattern matches the brief exactly with zero blast radius elsewhere. Matches an existing in-repo precedent (`SuppliersPage.tsx`/`ItemsPage.tsx`/`PurchaseOrdersPage.tsx`).                                                                                                                                | No   |
| `DailySalesReport.tsx`'s 5 existing `Card` usages are also converted to the new local pattern, as P12-0, even though Sales isn't in the brief's P12-1..7 list                                                                                                                                                                                                               | Otherwise Sales would be the one visually inconsistent tab (old rounded-lg card look) among 8 tabs that all just moved to rounded-2xl. Mechanical className-only change, no logic touched.                                                                                                                                                                                                                                                                           | No   |
| Every donut/bar chart's real aggregation or bucketing logic is extracted into a small, named, exported pure function (`computeStockHealthSlices`, `buildCustomerAgingBars`, `buildPartsLabourSlices`, `buildDailyCashFlow`, `buildRevenueMarginSlices`, `buildWageByRoleSlices`) and unit-tested directly, rather than attempting to render-test the chart component itself | `recharts`' `<ResponsiveContainer>` reports zero width under jsdom and renders no chart children at all — confirmed by an actual failing test run in P12-1 before adopting this pattern. No pre-existing chart component anywhere in `reports/` had a render test, for the same reason. Extracting the pure logic gives real, verifiable test coverage of the part that can actually have a bug (the math/grouping), without fighting an untestable rendering layer. | No   |
| Stock Health donut buckets `quantityOnHandMilli` as `> 0` (In Stock) vs. everything else (Out of Stock), rather than mirroring the pre-existing Phase-11 KPI card's `=== 0` check                                                                                                                                                                                           | The dev database can contain negative stock quantities (confirmed possible, though not present in this session's dev DB snapshot); the pre-existing KPI's `=== 0` check would silently exclude a negative-quantity item from both buckets. The donut's `> 0`/else split guarantees every line lands in exactly one bucket, so the two slices always sum to the total item count. The older KPI card itself was left untouched (out of this phase's scope).           | No   |
| Business Profit's Revenue vs Margin donut reads the report's own pre-computed `TOTAL` row (`unitCode === 'TOTAL'`) rather than re-summing `PARTS + REPAIR` client-side                                                                                                                                                                                                      | `UnitPlReportDto.rows` already includes an authoritative combined total row; re-summing the two peer units would duplicate arithmetic the server already did.                                                                                                                                                                                                                                                                                                        | No   |
| Wage-by-role donut reuses `ExpensesReport.tsx`'s existing cycling `PIE_COLORS` array verbatim, rather than inventing a new palette                                                                                                                                                                                                                                          | `staffRole` is a free-text field (unbounded set of distinct roles), an identical problem `ExpensesReport.tsx`'s "By category" pie already solved with a 6-color cycling array pulled from named tokens. Reusing it avoids a second solution to the same problem and a new set of magic colors.                                                                                                                                                                       | No   |
| Two brief-specified color tokens that don't exist were substituted for their real equivalents: `text-ink-base` → `text-ink` (P12-0's card headings), `colors.ink.base` → `colors.ink.default` (Jobs donut's Labour Revenue slice)                                                                                                                                           | `colors.ts`/`tailwind.config.js` define `ink.default` (Tailwind class `text-ink`), not `ink-base`/`ink.base`. Confirmed by reading both files directly before writing any code; using the non-existent class would have silently produced no CSS rule under Tailwind's JIT compiler.                                                                                                                                                                                 | No   |

---

## 7. Bugs found this phase

None found. Two lint-only issues were caught and fixed within the same
implementation step, before any commit — not carried forward as bugs:
(1) `StockHealthDonut.tsx` used a `number` directly inside a template
literal (`` `In Stock (${inStockCount})` ``), which
`@typescript-eslint/restrict-template-expressions` flags under this repo's
strict lint config — fixed with `String(inStockCount)`. (2) Three new test
files used `expect.any(String)` for a `fill` color assertion, which
triggered `@typescript-eslint/no-unsafe-assignment` — fixed by asserting
the exact expected token value (e.g. `colors.money.in`) instead, which is
both lint-clean and a stronger assertion.

**Environment issue found and fixed before final verification (not a code
bug, logged here for the record, same class of issue as Phase 11's own
entry):** the first `npm run verify` run at the end of P12-7 failed 281/565
tests, all in unrelated `packages/db` repository test files, with
`NODE_MODULE_VERSION 130` vs `127` mismatch errors — `better-sqlite3`'s
native binary held locked by 4 leftover `electron.exe` processes from prior
sessions. Killed those processes, ran `npm rebuild better-sqlite3`; the next
`npm run verify` run was clean: 98 test files, 565/565 passing. The same
class of environment issue recurred once more during the BUG-27/BUG-28
close-out session below and was fixed the same way.

**Two bugs found (and fixed) during close-out testing, before commit —
logged as BUG-27 and BUG-28 in PROJECT.md §4 (FIXED):**

- BUG-27 (MEDIUM) — the sidebar's Reports disclosure group started/stayed
  expanded when the active tab wasn't Reports at all (stale `localStorage`
  value, and no collapse-on-navigate-away logic in `Sidebar.tsx`). Fixed:
  initial state now also checks `activeTab === 'reports'`; the existing
  entering-Reports effect gained a collapse branch for `activeTab !==
'reports'`.
- BUG-28 (MEDIUM) — `ReportsPage.tsx` rendered both the Operational and
  Financial tab groups (and both section labels) simultaneously, regardless
  of which sidebar sub-item ("Daily Reports"/"Accounts") was clicked. Fixed:
  each group's block is now conditionally rendered on `activeGroup`.

Both are logged as FIXED, not open — see PROJECT.md §4 for full detail and
verification.

---

## 8. Open questions resolved this phase

None of PROJECT.md's currently-open questions are touched by this phase.

---

## 9. Notes for the next phase (Phase 12 is now closed)

- **Every report tab now uses the same local `rounded-2xl bg-surface p-6
shadow-sm` card pattern**, written directly in each tab file — not the
  shared `packages/ui/src/primitives/Card.tsx` primitive. Any future report
  tab (or a new sub-component within one) should follow this same local
  pattern rather than reaching for `<Card>`, to stay visually consistent
  with the rest of the Reports page.
- **Six new pure-function/chart-component file pairs were added this
  phase**, all following the same shape: a named, exported pure function
  (`computeStockHealthSlices`, `buildCustomerAgingBars`,
  `buildPartsLabourSlices`, `buildDailyCashFlow`, `buildRevenueMarginSlices`,
  `buildWageByRoleSlices`) doing the real math/grouping, plus a thin
  component that calls it and renders the actual `recharts` chart. Any
  future new chart in this app should follow the same split — the pure
  function is what gets unit-tested, since `recharts`'
  `<ResponsiveContainer>` cannot be meaningfully render-tested under jsdom
  (confirmed zero width, no chart children rendered, in this session).
- **`ReceivablesAgingReport.tsx` (297 lines) and `ExpensesReport.tsx` (281
  lines) are now the two files with the least headroom** under the 300-line
  cap in this directory. Any future change to either should check `wc -l`
  immediately, per this phase's own practice.
- **The pre-existing Phase-11 "Items Out of Stock" KPI card** in
  `StockValuationReport.tsx` still uses `quantityOnHandMilli === 0` (not
  `<= 0`) and so can silently exclude a negative-stock item from its count —
  this was deliberately left as-is (out of this phase's scope; the new
  Stock Health donut next to it uses the more correct `<= 0` bucketing
  instead). Worth a PROJECT.md Known-Bugs-style note for a future
  bug-fix-phase pass, since the two now visibly disagree on the same data.
- **Phase 12 is fully closed.** The next phase should read PROJECT.md's
  "Open Questions" section and `docs/PHASES.md` for what's next.
