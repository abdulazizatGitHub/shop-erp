# Phase Start Prompts

Use the appropriate prompt below as the FIRST MESSAGE in:

1. A new Claude Code agent session
2. A new chat in the Claude Project

The prompt for a new Claude Code session goes directly into the terminal.
The prompt for the Claude Project chat is pasted as the opening message.

Both receive the same prompt. The Claude Project adds the uploaded knowledge
files as background context. Claude Code reads the actual files on disk.

---

## How to start a new phase

1. Open the repo in Claude Code (the VS Code extension or terminal).
2. Start a new chat in the Claude Project.
3. Paste the phase-specific prompt below into BOTH.
4. Wait for the plan. Approve before any code is written.
5. At phase close: update PROJECT.md, PROGRESS.md, and the project
   knowledge files in the Claude Project before starting the next phase.

---

## Universal rules — included in every prompt

These are restated in each phase prompt. Do not abbreviate them.

```
RULES FOR THIS AND EVERY SESSION

- Read the specified files completely before writing any code.
- Reply with a plan first. Wait for approval. No code in the first reply.
- One subtask at a time. Complete it, verify it with ACTUAL OUTPUT, move on.
- "It builds", "it looks correct", and "the test file exists" are NOT
  verification. Paste real terminal output.
- For anything touching money or stock: calculate the expected number by
  hand, write it in a comment, run the code, compare.
- Read a file before you modify it.
- Bugs outside the current subtask go in PROJECT.md under Known Bugs.
  Do not fix them. Do not investigate them. Document and continue.
- If a requirement is ambiguous, STOP AND ASK. Do not guess.
- Do not build anything in CLAUDE.md section 10 (the forbidden list).
- Do not add a dependency without stating what it is and why.
- Do not start work belonging to a later phase.
- End every session: update PROJECT.md and PROGRESS.md, then give the
  session-close checklist from CLAUDE.md section 7.
```

---

## Phase 2 — Suppliers + Purchases

**Paste this as the first message in a new Claude Code session and in a new
Claude Project chat.**

```
You are the engineering agent on a production shop-management desktop
application. A real client is waiting. The software holds their money and
stock records. Correctness matters more than speed.

STEP 1 — Read these files completely, in this order. Do not skip any.

  1. CLAUDE.md
  2. PROJECT.md
  3. PROGRESS.md  (last two entries only)
  4. docs/PHASES.md  (Phase 2 section only)
  5. docs/phases/PHASE_2.md  (you will create this — see below)
  6. docs/SYSTEM_DESIGN.md  (sections 1, 2, 3 only)
  7. docs/DATABASE_RULES.md  (sections 2, 3 only)

STEP 2 — Before writing any code, do this:

  a) Run: git log --oneline -10
     Paste the output. Confirm you are on the correct branch and the
     last commit matches what PROJECT.md says.

  b) Run: npm run verify
     Paste the output. Confirm it exits 0 before touching anything.

  c) Create docs/phases/PHASE_2.md using the template at
     docs/phases/PHASE_TEMPLATE.md. Fill in the Goal, Scope, and Tasks
     from the requirements below. Leave Exit Criteria blank until I
     approve the plan — I may cut scope further.

STEP 3 — Reply with ONLY:

  - Confirmation you read all files
  - git log output (pasted raw)
  - npm run verify result
  - Your PHASE_2.md (full content, so I can review before you commit it)
  - Your task-by-task plan with exact verification for each task
  - Any question that blocks you before starting

  No code in this reply. Wait for my approval.

REPOSITORY

  github.com/abdulazizatGitHub/shop-erp
  Branch: main
  Last known good commit: [INSERT HASH OF LAST PHASE 1 COMMIT HERE]

PHASE 2 REQUIREMENTS

  Goal: The shop can record stock coming in from a supplier and see what
  they owe each supplier. A purchase adds to stock and creates a supplier
  liability. Opening balances from the old register can be imported.

  IN SCOPE

  P2-1 — Supplier CRUD
    party table, party_type = 'supplier'. Fields: name, shop_name (optional),
    phone (required), city_area, payment_terms, notes. party_code auto-
    generated as SUP-A-000001 using document_sequence, same mechanism as
    item_code. Reuse the party repository if it exists from any Phase 3
    preview work; if not, build it minimally now.
    Verify: create a supplier, query the party table directly, confirm all
    fields and the auto-generated code.

  P2-2 — Purchase entry
    A purchase records: supplier (required), warehouse (default: the seeded
    "Shop" warehouse), date, one or more lines (item + quantity in purchase
    UoM + unit cost in PKR).

    On save, in ONE TRANSACTION:
      - Insert purchase + purchase_line rows
      - Insert stock_movement rows (type = 'purchase', quantity positive,
        in stock UoM after conversion, unit_cost snapshot)
      - Insert party_ledger row (positive amount = shop owes supplier more)
      - Insert audit_log row
      - Insert sync_outbox row
      - Update item.last_purchase_cost and avg_cost (weighted average)

    Payment mode: cash or credit only. Cash = party_ledger entry +
    paid_amount equals total. Credit = party_ledger entry, paid_amount = 0.

    Cancellation: a reversing row in stock_movement and party_ledger, never
    a delete. Status field on purchase goes to 'cancelled'.

    Verify: one purchase with two lines (including a UoM-conversion item —
    gas cylinder converting to kg). Query stock_movement, party_ledger,
    item.last_purchase_cost/avg_cost directly. Hand-calculate the expected
    values and assert against them. Verify cancellation posts reversing rows
    and stock returns to pre-purchase level.

  P2-3 — Supplier opening balance import
    Same importer pattern as Phase 1. Column contract (exact headers):
      Supplier Name | Phone | Bill Reference | Bill Date |
      Original Amount (PKR) | Amount Paid So Far (PKR) | Due Date | Notes

    Match supplier by name: exact match after .trim().toLowerCase().
    Reject if no match. One party_ledger row per imported bill, type =
    'opening_balance', amount = (Original - Paid).
    Report file: same dual-location pattern as Phase 1 (next to source
    file + log directory copy).

    Verify: synthetic fixture with one matched row, one unmatched,
    one zero-balance row. Query party_ledger directly. Re-run — zero
    new rows (idempotent on bill reference + supplier).

  EXPLICITLY OUT OF SCOPE — do not build, do not design, do not mention:
    Payments out to suppliers (Phase 3)
    Cheque tracking (Phase 3)
    Supplier aging report (Phase 4)
    Purchase returns (Phase 4)

  DOCUMENT NUMBERING
    Purchases: PUR-A-000001 via document_sequence, doc_type = 'purchase'
    Suppliers: SUP-A-000001 via document_sequence, doc_type = 'supplier'

  KYSELY USAGE
    Phase 1 wrote the first real Kysely repositories. Use the same pattern
    for supplier and purchase repositories. Raw SQL only where Kysely cannot
    express it cleanly (complex aggregations). No stored procedures.

RULES FOR THIS SESSION

  - One subtask at a time. Paste real output for each before moving on.
  - Money: paisa. Quantity: milli-units. Both verified with hand-calculated
    values in test comments.
  - Any claim about file contents must be preceded by the command that
    reads it and its raw output.
  - Bugs outside the current subtask: document in PROJECT.md, continue.
  - Stop and ask if blocked. Do not guess and proceed.

SESSION CLOSE
  Update PROJECT.md, PROGRESS.md, docs/phases/PHASE_2.md, then give the
  session-close checklist from CLAUDE.md section 7.
```

---

## Phase 3 — Counter Sale + Udhaar

```
You are the engineering agent on a production shop-management desktop
application. A real client is waiting. The software holds their money and
stock records. Correctness matters more than speed.

STEP 1 — Read these files completely, in this order.

  1. CLAUDE.md
  2. PROJECT.md
  3. PROGRESS.md  (last two entries only)
  4. docs/phases/PHASE_2.md  (what Phase 2 delivered)
  5. docs/PHASES.md  (Phase 3 section)
  6. docs/SYSTEM_DESIGN.md  (section 5 — IPC contract, section 6 — sale flow)
  7. docs/DATABASE_RULES.md  (section 2 — transactions)

STEP 2 — Repo checks before any code:

  a) git log --oneline -10  (paste raw)
  b) npm run verify  (paste result)
  c) Create docs/phases/PHASE_3.md from the template.

STEP 3 — Reply with plan only. No code. Wait for approval.

REPOSITORY

  github.com/abdulazizatGitHub/shop-erp
  Last known good commit: [INSERT HASH HERE]

PHASE 3 REQUIREMENTS

  Goal: A salesman can ring up a sale at the counter in under 30 seconds
  using only a keyboard. Cash and credit (udhaar) are both handled.
  Stock decrements. The customer's running balance is correct.

  CRITICAL UX REQUIREMENT — read before designing any screen:
  The salesman is a shopkeeper's assistant with no technical background.
  The sale screen must be operable with keyboard only. Mouse is optional.
  Every interaction must complete in under 30 seconds for a simple sale.
  This is the one screen where speed is a hard requirement. All others
  can be slower.

  IN SCOPE

  P3-1 — Customer CRUD
    party table, party_type = 'customer'. Fields: name, shop_name
    (for wholesale customers), phone, customer_type (Retail/Wholesale),
    price_level_id, credit_limit (nullable), notes.
    Customer code: CUS-A-000001.
    Walk-in anonymous sale (customer_id = NULL) must also work.

  P3-2 — Counter sale screen
    Keyboard-driven. Tab between fields. Enter to confirm each step.
    Flow: search item -> set quantity -> confirm line -> repeat or checkout.
    At checkout: select customer (or anonymous), choose cash/credit,
    enter amount paid.

    On save, ONE TRANSACTION:
      sale + sale_line rows (with unit_cost snapshot for margin reporting)
      stock_movement rows (type = 'sale', negative quantity)
      party_ledger row if credit (type = 'sale')
      audit_log + sync_outbox

    Price logic:
      - Customer has price_level_id -> use that level's item_price
      - No price level or walk-in -> use default Retail price
      - If no item_price row exists for this level, fall back to Retail
      - business_unit_id on each sale_line: from the item's business_unit_id

    Credit limit: warn if exceeded, allow with confirmation. Never hard block.
    Stock: warn if selling below zero, allow with confirmation. Never block.

    Verify: complete sale keyboard-only, timed under 30 seconds.
    Query sale, sale_line, stock_movement, party_ledger directly.
    Hand-calculate totals. Verify credit limit warning fires. Verify
    negative stock warning fires. Verify cancellation posts reversing rows.

  P3-3 — Payment received
    Record a customer paying against their udhaar balance.
    party_ledger row, type = 'payment_received', negative amount.
    payment table row.
    Verify: balance before, payment, balance after — all by direct query.

  P3-4 — Customer opening balance import
    Column contract (exact headers):
      Customer Name | Phone | Bill Reference | Bill Date |
      Original Amount (PKR) | Amount Paid So Far (PKR) | Notes
    Same pattern as supplier opening balance import.
    Match by name (exact, trimmed, case-insensitive).
    One party_ledger row per bill, type = 'opening_balance'.

  EXPLICITLY OUT OF SCOPE:
    Retail vs wholesale price UI toggle (use price_level on customer)
    Discount per line (schema supports it, no UI yet)
    Receipt printing (Phase 4)
    Delivery charges on sale (Phase 4)

  TIMING VERIFICATION
  P3-2 must be timed. "Under 30 seconds" means you sit at the keyboard,
  create a sale from item search to confirmation, and measure wall time.
  Paste the time. If it exceeds 30 seconds, identify the bottleneck and
  fix it before closing the phase.

SESSION CLOSE
  Update PROJECT.md, PROGRESS.md, docs/phases/PHASE_3.md.
  Checklist from CLAUDE.md section 7.
```

---

## Phase 4 — Printing + Core Reports

```
You are the engineering agent on a production shop-management desktop
application. A real client is waiting. Go-live is approaching.

STEP 1 — Read in order:
  1. CLAUDE.md
  2. PROJECT.md
  3. PROGRESS.md (last two entries)
  4. docs/phases/PHASE_3.md
  5. docs/PHASES.md (Phase 4 section)

STEP 2 — Repo checks: git log --oneline -10, npm run verify. Paste both.

STEP 3 — Reply with PHASE_4.md draft and plan. No code.

REPOSITORY: github.com/abdulazizatGitHub/shop-erp
Last known good commit: [INSERT HASH HERE]

PHASE 4 REQUIREMENTS

  Goal: The shop can hand a customer a printed receipt. The owner can
  see today's sales, who owes money, and what stock is available.
  Data can be backed up and restored.

  CRITICAL — get the printer model from the owner before writing
  any printing code. Do not assume 80mm ESC/POS. The wrong driver
  assumption costs a full day. Ask first if you do not know.

  IN SCOPE

  P4-1 — Thermal receipt printing (80mm ESC/POS)
    Print after sale commits. Never inside the transaction.
    A printer error must not reverse or lose a committed sale.
    Show a "reprint" button — a sale missing its receipt must be
    recoverable without re-entering the sale.
    Verify: print on the actual printer. Not a PDF. Not a preview.
    The actual thermal printer.

  P4-2 — A4 wholesale invoice
    For wholesale customers who need a paper invoice to file.
    PDF generated via a Node library (not Puppeteer — too heavy).
    Verify: open the PDF, confirm all fields and totals are correct.

  P4-3 — Core reports (read-only, from views)
    Daily sales summary (v_daily_sales)
    Stock on hand with valuation (v_stock_on_hand + item join)
    Receivables: who owes me money, with aging (30/60/90 days)
    Cash book: money in and out for a date range
    Unit P&L: v_unit_direct_margin per business unit

    Reports read from the views already in the schema.
    Do NOT re-implement the arithmetic in TypeScript.
    Verify: seed known data, run each report, hand-check every total.

  P4-4 — Backup and restore
    Backup: encrypted copy of the .db file to a chosen folder.
    Keep 30 daily copies, rotate.
    Restore: replace the live database with a backup copy.
    Verify: backup a database with known data. Restore it to a fresh
    location. Query the restored database and confirm the data matches.
    This test must use a REAL backup file, not a mock.

  P4-5 — Pull-the-plug test (moved here from Phase 5)
    Cut power (or kill -9 the process) mid-transaction, 10 times.
    Confirm no data corruption each time.
    This is the most important reliability test in the entire project.

  EXPLICITLY OUT OF SCOPE:
    FBR e-invoicing
    Analytics dashboards beyond the five reports above
    Email or WhatsApp sharing of receipts

SESSION CLOSE
  Update PROJECT.md, PROGRESS.md, docs/phases/PHASE_4.md.
  Checklist from CLAUDE.md section 7.
```

---

## Phase 5 — Deploy + Parallel Run

```
You are the engineering agent on a production shop-management desktop
application. Phase 5 is deployment. No new features.

STEP 1 — Read in order:
  1. CLAUDE.md
  2. PROJECT.md
  3. PROGRESS.md (last two entries)
  4. docs/phases/PHASE_4.md
  5. docs/PHASES.md (Phase 5 section)

STEP 2 — Repo checks. git log --oneline -10, npm run verify. Paste both.

STEP 3 — Reply with PHASE_5.md draft and plan. No code.

REPOSITORY: github.com/abdulazizatGitHub/shop-erp
Last known good commit: [INSERT HASH HERE]

PHASE 5 REQUIREMENTS

  Goal: The system is installed on the client's real machine. Real data
  is loaded. Staff can complete a sale unaided. The shop runs the software
  and the paper register in parallel for at least two weeks.

  DO NOT ADD NEW FEATURES IN THIS PHASE. If something is missing, document
  it as a bug and schedule it for Phase 8. Do not build it now.

  IN SCOPE

  P5-1 — Install on client machine
    Install the packaged application on the client's actual PC.
    Confirm it launches. Confirm the database lands in %APPDATA%\ShopERP\.
    Confirm the UPS is connected and tested.

  P5-2 — Load real data
    Import the client's actual shop_data_templates.xlsx.
    Run the items import, review the reject report with the client.
    Resolve every rejection before calling the import complete.
    Load opening stock, customer balances, supplier balances.

  P5-3 — Train staff
    Produce a one-page Urdu cheat sheet: how to ring up a sale,
    how to record a payment, how to search an item.
    Sit in the shop. Watch staff use it. Fix only what blocks a real
    transaction. Note everything else as bugs.

  P5-4 — Parallel run
    The shop keeps the paper register AND enters every transaction in
    the system. For at least two weeks.
    At the end of each day: compare the register total to the system
    total. Any mismatch is investigated and resolved.

  P5-5 — Power-cut test
    If not already done in Phase 4: cut power mid-transaction 10 times.
    Confirm no data loss each time.

  EXIT CRITERIA
    - Staff complete one full day of real billing unaided
    - Register total and system total match for that day
    - Power-cut test passed
    - Backup tested on the real machine (backup, uninstall, reinstall, restore)

SESSION CLOSE
  Update PROJECT.md, PROGRESS.md, docs/phases/PHASE_5.md.
  Checklist from CLAUDE.md section 7.
```

---

## Generic template for Phase 6+

```
You are the engineering agent on a production shop-management desktop
application. This is Phase [N] — [Phase Name].

STEP 1 — Read in order:
  1. CLAUDE.md
  2. PROJECT.md
  3. PROGRESS.md (last two entries)
  4. docs/phases/PHASE_[N-1].md (what the previous phase delivered)
  5. docs/PHASES.md (Phase [N] section)
  6. docs/SYSTEM_DESIGN.md (sections relevant to this phase — state which)

STEP 2 — Repo checks:
  git log --oneline -10  (paste raw)
  npm run verify  (paste result, must exit 0)

STEP 3 — Reply with ONLY:
  - Confirmation of files read
  - git log and npm run verify output (pasted raw)
  - docs/phases/PHASE_[N].md (full draft for review)
  - Task-by-task plan with exact verification for each
  - Questions blocking you

  No code. Wait for approval.

REPOSITORY: github.com/abdulazizatGitHub/shop-erp
Last known good commit: [INSERT HASH HERE]

PHASE [N] REQUIREMENTS

  [Paste the detailed requirements here when starting the phase]

RULES: same as always — one task at a time, real output, hand-calculated
money and quantity assertions, bugs documented not fixed mid-phase.

SESSION CLOSE
  Update PROJECT.md, PROGRESS.md, docs/phases/PHASE_[N].md.
  Checklist from CLAUDE.md section 7.
```
