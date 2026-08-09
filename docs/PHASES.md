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
