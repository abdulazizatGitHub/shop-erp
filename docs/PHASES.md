# PHASES.md — Phase Plan

> One phase at a time. A phase is **not** complete until every exit criterion
> is verified with actual output. Do not start work belonging to a later phase.

**Hard deadline:** 2026-08-31 for Phases 0–5 (billing + udhaar in daily use).
Phases 6+ are September onward.

---

## Phase 0 — Foundation & Environment

**Goal:** A repo that builds, lints, tests, and packages an empty Electron app.
No business features.

| ID    | Task                                           | Exit criterion                                          |
| ----- | ---------------------------------------------- | ------------------------------------------------------- |
| P0-1  | `git init`, workspaces, install deps           | `npm install` completes clean                           |
| P0-2  | TS config, path aliases                        | `npm run typecheck` passes                              |
| P0-3  | ESLint + Prettier                              | `npm run lint` passes on empty repo                     |
| P0-4  | Husky pre-commit + commitlint                  | A bad commit message is rejected — show the output      |
| P0-5  | Vitest + one trivial test                      | `npm test` shows 1 passing                              |
| P0-6  | `packages/shared`: Money, Qty, ID              | Unit tests for each pass — paste output                 |
| P0-7  | `packages/db`: migration runner                | Runs `0001_init.sql`, creates the DB file               |
| P0-8  | Apply base schema + BU addendum                | Table count matches expected; all views execute         |
| P0-9  | Electron shell + IPC scaffold                  | App window opens with "Hello"; one IPC round-trip works |
| P0-10 | GitHub Actions CI                              | CI green on a pushed branch                             |
| P0-11 | `npm run package` produces a Windows installer | `.exe` produced and runs on a clean machine             |

**Exit criteria (all must be verified):**

- [ ] `npm run verify` (typecheck + lint + test) passes — output pasted
- [ ] Fresh `git clone` + `npm install` + `npm run dev` opens a window
- [ ] Database file is created, migrations applied, `v_party_balance` executes
- [ ] Money and Qty helpers have passing tests including rounding edge cases
- [ ] Installer built and launched on a Windows machine
- [ ] `PROJECT.md` and `PROGRESS.md` updated

**Do NOT build in Phase 0:** any screen with business meaning, any domain table
access from the UI, any styling beyond a blank window.

---

## Phase 1 — Item master + import

**Goal:** Items exist, can be created, edited, searched, and bulk-imported.

- Categories, brands, units of measure
- Item CRUD with business unit, UoM conversion, serial flag
- Price levels (Retail, Wholesale) + item prices
- **Excel/CSV import for Items and Opening Stock** with a dry-run validation
  report that lists every rejected row and why
- Opening stock posted as `stock_movement` rows of type `opening`
- Item search that is fast and keyboard-driven

**Exit criteria:**

- [ ] 400 sample items imported; count verified by query
- [ ] Import rejects a bad row with a clear message naming the row and column
- [ ] Gas item with cylinder→kg conversion produces the correct per-kg cost — hand-calculated and compared
- [ ] Stock on hand for a known item matches a hand calculation
- [ ] Re-running the same import does not duplicate items

---

## Phase 2 — Purchases + suppliers

- Supplier CRUD (`party` with type `supplier`)
- Purchase entry with lines, freight, discount
- Stock in via `stock_movement`
- Supplier balance via `party_ledger`
- Payments out, cheque tracking
- Supplier opening balance import

**Exit criteria:**

- [ ] A purchase increases stock by exactly the right amount — verified by query
- [ ] Supplier balance after purchase + partial payment matches a hand calculation
- [ ] Cancelling a purchase reverses stock via a **new reversing row**, not a delete
- [ ] Purchase in cylinders correctly increases kg stock

---

## Phase 3 — Counter sale + udhaar ⭐ the core

- Sale screen: **keyboard-driven, mouse optional**
- Customer selection (or anonymous walk-in) with price level applied
- Cash sale, credit (udhaar) sale, partial payment
- Stock out via `stock_movement`; cost snapshot onto `sale_line`
- Customer ledger + payment received
- Credit limit warning (warn, do not block)
- Customer opening balance import
- Line-level `business_unit_id` tagging

**Exit criteria:**

- [ ] Sale decrements stock correctly — verified by query
- [ ] Customer balance after sale + payment matches a hand calculation
- [ ] Retail vs wholesale customer gets the correct price automatically
- [ ] Selling more than available stock is handled per the agreed policy (warn, allow, record negative)
- [ ] Cancelling a sale reverses stock **and** ledger via reversing rows
- [ ] A full sale completes in under 30 seconds with keyboard only — timed

---

## Phase 4 — Printing + core reports

- Thermal receipt (80mm) for counter sale
- A4 invoice for wholesale
- Reports: daily sales, stock on hand + valuation, **who owes me money** (with aging), cash book
- Backup: encrypted DB copy to a chosen folder; restore path tested

**Exit criteria:**

- [ ] Receipt prints on the client's actual printer model
- [ ] Aging report totals equal the sum of customer balances — hand-checked
- [ ] Backup file restores into a working database on a different machine
- [ ] Stock valuation total matches sum of (qty × cost) — hand-checked

---

## Phase 5 — Deploy + parallel run

- Install on the shop's real machine
- Load real items, opening stock, opening balances
- Train staff; produce a one-page Urdu cheat sheet
- Run in parallel with the paper register for at least two weeks
- **Pull-the-plug test:** cut power mid-sale, repeatedly, verify no corruption
- Daily on-site observation; fix only what breaks

**Exit criteria:**

- [ ] Shop completes one full day of real billing on the system
- [ ] Register total and system total match for that day
- [ ] Power-cut test passed 10 times with no data loss
- [ ] Staff can complete a sale unaided

**Add no new features in Phase 5.**

---

## Phase 6 — Repair jobs & the two-unit split (September)

- Job card: intake, fault, accessories, estimate, approval, status
- Technician assignment; technician-as-warehouse custody
- Parts issued to job (`job_issue`) with cost + price snapshot
- Line-level `payer_party_id` and `revenue_type`
- Invoice on delivery with parts and labour tagged to their units
- `v_job_split` and `v_unit_pl` reports
- Internal transfer for unbilled consumption
- Custody reconciliation (noted, never auto-deducted)

**Exit criteria:**

- [ ] An installation job splits correctly: labour → Repair, pipe → Spare Parts — hand-checked
- [ ] A Dawlance job bills labour to Dawlance and extra pipe to the customer on one job
- [ ] Technician custody view shows exactly what a technician still holds
- [ ] Parts issued to a job do **not** appear as counter sales in any report

---

## Phase 7 — Staff, wages, expenses (September/October)

- Attendance (present / half-day / absent)
- Daily wage accrual, advances (peshgi), commission on labour
- Expense entry with category, business unit, vehicle
- Cash session open/close with counted vs expected

---

## Phase 8 — Bug-fix & hardening

Dedicated phase. Work through `PROJECT.md` Known Bugs by severity. **No new
features.**

---

## Phase 11 — Reports UI Polish & Navigation Redesign

The owner navigates to reports through an expandable sidebar group, every
report uses plain language instead of developer terms, every long table is
paginated, and the Sales tab shows trend indicators and sparklines against
the previous period plus a per-item sold summary.

- P11-0: Environment check — audit only, no code
- P11-1: Sidebar "Reports" nav item becomes an expandable group with two
  sub-items ("Daily Reports", "Accounts")
- P11-2: Renderer-only terminology rename to plain-language strings across
  all 8 report tabs
- P11-3: Shared `Pagination` component wired into every table that can
  exceed 10 rows
- P11-4a: New `report:periodComparison` IPC channel — current vs. previous
  period day-by-day figures
- P11-4b: New `report:itemSoldSummary` IPC channel — per-item sold summary
  for a date range
- P11-5: Sales tab redesigned into 6 sections — date selector, summary
  cards with trend/sparklines, a current-vs-previous trend chart, a Cash
  vs Credit breakdown, the new "What Was Sold" table, and transactions
- P11-6: Visual polish pass on the remaining 7 tabs — negative-inventory-
  valuation guard on Stock, Jobs chart changed from stacked to grouped
  bars, an always-visible month note on Wages

**Exit criteria:**

- [x] `npm run verify` passes — 541/541
- [x] Sidebar shows "Daily Reports"/"Accounts" sub-items, correctly
      highlighted, hidden when the sidebar is collapsed
- [x] No old report terminology visible anywhere in the reports UI
- [x] Every long table in the reports UI is paginated
- [x] Sales tab's summary cards each show a trend indicator and sparkline
      against the previous period
- [x] Stock tab shows "—" instead of a negative inventory valuation
- [x] Jobs tab chart is grouped (not stacked) bars

See `docs/phases/PHASE_11.md` for full sub-phase detail, design decisions,
and verification output.

---

## Phase 12 — Reports Visual Structure & Chart Additions

Every report tab has the same visual structure — each logical section is
its own rounded white card on a light-grey page background, matching the
app's other redesigned pages (Suppliers, Items, Purchase Orders). Seven of
the eight tabs get one or two new charts presenting existing data in a
second visual format. Two bugs found while closing the phase (sidebar
auto-collapse, inactive report group tabs visible) were fixed before commit.

- P12-0: Structural prerequisite — removed `ReportsPage.tsx`'s shared outer
  Card, `bg-surface-page` on the outer wrapper, Sales tab converted to the
  new local card pattern
- P12-1: Stock tab — Stock Health donut + Best Performers horizontal bar
- P12-2: Udhaar tab — per-customer stacked aging bar chart
- P12-3: Jobs tab — Parts vs Labour donut
- P12-4: Cash Record tab — Daily Cash Flow grouped bar chart
- P12-5: Business Profit tab — Revenue vs Margin donut
- P12-6: Wages tab — Wage cost by role donut
- P12-7: Expenses tab — card structure only, no new chart
- Bug fix: sidebar's Reports group no longer starts/stays expanded when
  navigating away from Reports (`Sidebar.tsx`)
- Bug fix: Reports page now shows only the active sidebar group's tabs
  (Operational or Financial), not both at once (`ReportsPage.tsx`)

**Exit criteria:**

- [x] `npm run verify` passes — 569/569
- [x] `ReportsPage.tsx` outer wrapper uses `bg-surface-page`
- [x] All 8 tabs use the same local card pattern, no tab uses the shared
      `Card` primitive
- [x] Every new chart element has `isAnimationActive={false}`
- [x] Zero new IPC channels — `report.handler.ts` still has 10 handlers
- [x] Sidebar's Reports group collapses when navigating to any non-Reports
      tab, regardless of how it was expanded
- [x] Reports page shows only the active group's 4 tabs at a time

See `docs/phases/PHASE_12.md` for full sub-phase detail, design decisions,
and verification output.

---

## Phase 13 — Customer Ledger, Invoice Modal, Payment Receipt, Customer Statement

The owner and staff can open any customer's record and see their complete
financial history in a single chronological ledger with a running balance,
click any row to view the full invoice or payment receipt, generate and
print a dated account statement, and add new customers directly from the
Customers screen. Every printed document draws its shop identity header/
footer from one source of truth (`ShopIdentity`).

- CL-0a/CL-0b: Shop identity backend + settings update; shared
  `DocumentHeader`/`DocumentFooter`/`DocumentSection` components
- CL-1–CL-4: Customer ledger query (window-function running balance),
  contracts, IPC, `sale:getWithLines`
- CL-5–CL-9: Customer detail page, sale invoice modal, payment receipt
  document + modal, customer statement PDF, add-customer form
- CL-10: Customer balance import converted to renderer-read CSV (Option B),
  matching the supplier-balance-import pattern
- Post-completion polish series: CSV ledger export, payment modal redesign,
  customer-screen card consistency pass

**Exit criteria:**

- [x] `npm run verify` passes — 602/602 (baseline 569)
- [x] Customer detail page, sale invoice modal, payment receipt modal,
      customer statement modal, add-customer modal all owner-confirmed on
      the shop machine (2026-09-20)
- [x] `sale_line.description` snapshot used everywhere — no live item join
      in historical document display
- [x] Customer balance import handler has zero `dialog.showOpenDialog`/
      `readFileSync` references — confirmed by grep

See `docs/phases/PHASE_13.md` for full sub-phase detail, design decisions,
and verification output.

---

## Phase 14 — Jobs Module Redesign (UI/UX)

A repair job can be created in under 30 seconds at intake, its status
reflects what has physically happened rather than a manually-set dropdown,
two technicians can be assigned to one job, a cancelled job closes cleanly
with its parts returned to stock, and the job card shows a unified
chronological history.

- P14-1: Multi-technician schema (`job_technician`, migration 0015)
- P14-2: Job intake redesign — customer search-or-create with phone dedup
- P14-3: Status auto-transitions on real actions (part issued, diagnosis
  saved), manual dropdown removed
- P14-4: Cancel job — reversing stock movement, one transaction
- P14-5: Multi-technician assignment panel
- P14-6: Diagnosed fault field (`job:updateDiagnosis`)
- P14-7: Job list — overdue/stale indicators, search, print-from-list
- P14-8: Unified History panel
- V1–V5/F1–F3/G1–G6: visual/UX polish passes (brand dropdown, delivery
  modal redesign, status-picker removal, "Client" terminology)

**Exit criteria:**

- [x] `npm run verify` passes — 627/627 (baseline 602)
- [x] Two technicians assigned to a real job, verified against a live DB
- [x] Cancelling a job with an unreturned part reverses stock via a new
      `job_return` row with the exact negative of the original quantity
- [x] A full lifecycle (create → assign → issue part → diagnose → unassign
      → deliver) produces a correctly time-ordered History panel

See `docs/phases/PHASE_14.md` for full sub-phase detail, design decisions,
and verification output.

---

## Phase 15 — Job Client Table + On-site Jobs + Awaiting Parts Flow

Job clients are stored in their own `job_client` table, entirely separate
from the Spare Parts ledger's `party` customers. A job records whether work
happens in-shop or on-site, capturing the client's address at intake. Staff
can mark a job "awaiting parts" with a required reason; issuing a part to
that job auto-advances it to in-progress.

- P15-1: `job_client` migration (0016) + `job.job_client_id`
- P15-2: `job-client` repository, contracts, IPC
- P15-3: Link job creation to `job_client`, denormalized reads
- P15-4: Job intake form redesign (`JobClientPicker`, on-site address group)
- P15-5: Job card / list show client info; awaiting-parts reason display
- P15-6: Awaiting-parts state-machine wiring + reason dialog

Resolves Q-P15-1 (job clients get their own table, not
`party_type='job_client'`) and fixes BUG-JOBCLIENT-1 (job intake was
searching the wrong customer population).

**Exit criteria:**

- [x] `npm run verify` passes — 644/644 (baseline 627)
- [x] New on-site job with a new client writes both rows in one
      transaction, verified against a real DB
- [x] Reselecting an existing client never creates a duplicate
      `job_client` row — verified against a real DB
- [x] Full received → awaiting_parts (reason persisted) → in_progress
      sequence confirmed against real output

See `docs/phases/PHASE_15.md` for full sub-phase detail, design decisions,
and verification output.

---

## Phase 16 — Jobs Settings: Service Charges, Brands, Commission Claims

The shop owner can manage service charges and appliance brands without a
developer touching the database, and commission is no longer automatic:
the owner reviews and approves (or rejects) a claim for every delivered
labour charge that has commission configured, deciding who gets paid and
how much. Replaces Phase 7's automatic per-technician commission model
entirely.

- P16-1: Service Charges section — list, create, edit, toggle active for
  `service_charge`; commission mode (none / fixed paisa / basis points)
- P16-1b: Settings shell redesign (OD-16-11) — grouped left sub-nav +
  routed right content pane, replacing the original stacked-cards layout
- P16-2: Brand management — Brands section, DB-driven job-intake
  dropdown replacing the hardcoded `BRAND_OPTIONS` constant
- P16-3a: Commission claim schema (`commission_claim`/
  `commission_decision`/`commission_decision_recipient`/
  `commission_decision_reversal`), pure claim-calculation function,
  delivery-transaction claim insert, approve/reject/reverse core
  services + IPC, retiring Phase 7's automatic commission entirely
  (ADR-0015)
- P16-3b: Commission Approvals section (Settings shell) + wage-report
  sign fix (a reversal-only month must show as clawed back, not earned)
- P16-3c: Technician removal guard (OD-16-5) — the technician list locks
  on `ready`/`delivered`/`cancelled`, for both assign and unassign;
  removal requires a stored reason
- P16-4: Shop Identity verification — owner smoke test

**Exit criteria:**

- [x] `npm run verify` passes — 845/845 (baseline 649/649)
- [x] Service Charges section: create/edit/toggle a charge, commission
      mode validated (none/fixed/bp mutually exclusive)
- [x] Brands section: create/toggle a brand; job intake reads the live
      DB-driven list, CSV import matching unaffected
- [x] A commission-configured labour line's delivery writes a claim
      inside the delivery's own transaction — a claim insert failure
      rolls back the entire delivery (ADR-0015)
- [x] Owner approves a claim to one or more recipients (any active
      staff), rejects with a reason, or reverses a decided claim with a
      reason — a reversed decision nets to zero, never edited in place
- [x] Wage report shows commission by approval month, correctly signed
      through a reversal, plus one pending-commission total in its
      header (not split per technician)
- [x] Technician list locked on ready/delivered/cancelled for both
      assign and unassign; removal reason required and stored; the lock
      lifts automatically if a job moves back to an earlier status
- [x] Owner manually confirmed (P16-4): Shop Identity persists across
      restart and prints on an invoice; also hand-verified the full
      end-to-end commission flow and the P16-3c lock/reason flow in the
      running app

See `docs/phases/PHASE_16.md` for full sub-phase detail, the 12 owner
decisions (OD-16-1–OD-16-12), ADR-0014/ADR-0015, and verification output.
