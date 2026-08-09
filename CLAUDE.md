# CLAUDE.md — Project Context & Operating Rules

> **Read this file completely at the start of every session. No exceptions.**
> Then read `PROJECT.md` (current state) and the current phase section of
> `docs/PHASES.md` before writing any code.

---

## 1. What this project is

A desktop shop-management system for a Pakistani AC / fridge / oven **repair
shop with an attached spare-parts counter**, in Malakand, KP.

**First customer is real and is waiting.** Target: usable for daily billing and
udhaar by end of August 2026. Everything else is secondary to that.

The long-term goal is to sell the same system to other shops. **That goal must
never justify work in the current phase.** Generalise on customer #4, not
customer #1.

### The defining business fact

The client runs **two business units that trade with each other**:

| Unit            | Owns stock               | Earns                    | Example                                      |
| --------------- | ------------------------ | ------------------------ | -------------------------------------------- |
| **Spare Parts** | Yes — all physical stock | Margin on parts          | Sells a compressor over the counter          |
| **Repair**      | No — consumes parts      | Labour / service charges | AC installation, gas charging, fridge repair |

**Keeping these two separate in every report is the primary reason this
software exists.** If a change blurs that separation, it is wrong.

---

## 2. The Golden Rules

1. **Read before writing.** Always.
2. **Verify before closing.** Always.
3. **Document before ending the session.** Always.
4. **One thing at a time.** Complete and verify each subtask before starting the next.
5. **If you find something unexpected, stop and report. Do not improvise.**
6. **The spec describes intent. The live code is the truth.** When they conflict, read the live code.
7. **"It looks correct" is not verification. Actual output is verification.**
8. **A bug found during testing is documented, not fixed on the spot** — unless it blocks the current phase.
9. **Every session leaves the project better documented than it found it.**
10. **The next agent must be able to continue using only the written documents.**

---

## 3. Non-negotiable technical rules

These cause silent, unfindable bugs if broken. They are not style preferences.

### 3.1 Money is INTEGER paisa. Never float.

```ts
// WRONG — will produce balances off by 0.01 that you will never find
const total = price * qty; // number, floating point

// RIGHT
import { Money } from '@shop/shared';
const total = Money.multiply(unitPricePaisa, qtyMilli);
```

- Rs 34,500.50 is stored as `3450050`.
- Divide by 100 **only at the moment of display**.
- Database columns for money are `INTEGER`. Never `REAL`, never `NUMERIC`.
- Any variable holding money ends in `Paisa` (`totalPaisa`, `unitPricePaisa`).

### 3.2 Quantity is INTEGER milli-units.

- 34.5 kg is stored as `34500`.
- Variables end in `Milli` (`quantityMilli`).
- Same reason as money: no floats in stored quantities.

### 3.3 Stock and ledgers are APPEND-ONLY.

```ts
// WRONG — destroys history, breaks audit, makes sync impossible
await db.update(item).set({ stockQty: newQty });

// RIGHT
await stockMovements.insert({ itemId, quantityMilli: -qty, movementType: 'sale', ... });
```

- Current stock = `SUM(stock_movement.quantity)`. Never a stored mutable column.
- Current balance = `SUM(party_ledger.amount)`. Never a stored mutable column.
- **Corrections are new reversing rows**, never edits or deletes.
- `stock_balance_cache` is a rebuildable cache, **never the source of truth**.

### 3.4 IDs are application-generated UUIDv7.

- Never `AUTOINCREMENT`. This is what makes future multi-device sync possible.
- Human-readable document numbers (`INV-A-000123`) are a **separate** field
  from the primary key, and carry a device code.

### 3.5 `tenant_id` on every table, always.

Currently a constant. Costs nothing now; saves a full migration later.

### 3.6 Every write goes through a transaction.

Any operation touching more than one table is wrapped in a single transaction.
A sale writes to `sale`, `sale_line`, `stock_movement`, and `party_ledger` —
all four succeed or none do.

### 3.7 No business logic in SQL.

No stored procedures, no triggers for business rules, no DB-specific features.
Logic lives in `packages/core`. This keeps SQLite→Postgres portability open.

---

## 4. Architecture

```
apps/client        FRONTEND. React UI. Sandboxed. No DB, no Node, ever.
apps/server        BACKEND. Electron main. IPC handlers, printing, backup, import.
packages/contracts Zod schemas + types. The API surface both sides share.
packages/core      Domain logic. Pure TypeScript. No Electron, no SQL, no React.
packages/db        Schema, migrations, repositories. ONLY place SQL is written.
packages/ui        Presentational React components. No domain knowledge.
packages/shared    Money, Qty, IDs. Zero dependencies.
```

**There is NO HTTP server. Do not add Express or Fastify to the desktop build** —
it would open a port on the shop's PC exposing the whole database to the LAN.
The transport is Electron IPC; the layering is the same as a web API:

| Web API    | Here                                                 |
| ---------- | ---------------------------------------------------- |
| Route      | IPC channel (`apps/server/src/ipc/channels.ts`)      |
| Controller | Handler (`apps/server/src/ipc/handlers/`)            |
| Middleware | Handler pipeline (`apps/server/src/ipc/middleware/`) |
| Service    | `packages/core`                                      |
| Repository | `packages/db/repositories`                           |

Handlers are **thin**: declare the pipeline, call one service, return. A handler
containing a business `if` has the rule in the wrong file.

**Dependency direction is one-way and lint-enforced. See
`docs/PROJECT_STRUCTURE.md` §2 for the full matrix.** If you need to break it,
**stop and report** — it usually means logic is in the wrong layer.

### Stack (decided — see ADR-0001, ADR-0002)

- TypeScript everywhere. **No Python.**
- Electron + React + Vite
- **SQLite** (better-sqlite3) locally. Postgres only in future cloud mode.
- Kysely for typed SQL. No heavy ORM.
- Vitest for tests.

---

## 5. Session protocol

### At session start

1. Read `CLAUDE.md` (this file).
2. Read `PROJECT.md` — current phase, status, known bugs.
3. Read the current phase section of `docs/PHASES.md`.
   3b. Read `docs/SYSTEM_DESIGN.md` if the task touches layers, IPC, or module boundaries.
4. Read any file you are about to modify **before** modifying it.
5. State which phase and which task you are working on.

### During the session

- Work on **one task at a time**. Verify it. Then move on.
- Do not start work belonging to a later phase.
- Do not fix bugs outside the current task — document them in `PROJECT.md`.
- If a requirement is ambiguous, **stop and ask**. Do not guess and proceed.

### Before ending the session

Run the checklist in §7. All boxes must be ticked.

---

## 6. What "verified" means

Not verified:

- "The code looks correct."
- "The types compile."
- "The test file exists."

Verified:

- The test **ran** and **passed**, and you pasted the actual output.
- The query **ran** against a real database and returned the expected rows.
- The app **launched** and the screen **rendered**.
- The number in the report **matches** a figure calculated by hand.

For anything touching money or stock, the standard is: **calculate the expected
number by hand, run the code, and compare.** Nothing less.

---

## 7. Session-close checklist

Copy this into your final message and tick every box.

- [ ] All verification checks passed
- [ ] No unresolved bugs introduced by this phase
- [ ] `PROJECT.md` updated with new status
- [ ] `PROGRESS.md` updated with session entry
- [ ] Next phase prerequisites are met
- [ ] Any new bugs documented in `PROJECT.md`
- [ ] Test suite passing (if the project has tests)

---

## 8. Bug tracking format

Bugs found but not fixed go in `PROJECT.md` under **Known Bugs**:

```
### BUG-[N]: [Title] — [CRITICAL/HIGH/MEDIUM/LOW]
Found in:    Phase [X], [YYYY-MM-DD]
Description: [What is wrong]
Impact:      [What breaks or is incorrect]
Fix:         [How to fix it, if known]
Status:      UNFIXED — waiting for [phase / migration / decision]
```

**Never fix bugs during a phase that is not about fixing bugs.** Document them
and continue. Bug-fixing sessions have their own phase.

Severity guide:

- **CRITICAL** — wrong money, wrong stock, data loss, or the shop cannot bill.
- **HIGH** — a core workflow is blocked; a workaround exists but is painful.
- **MEDIUM** — wrong or confusing behaviour with an easy workaround.
- **LOW** — cosmetic, or affects a rarely used path.

---

## 9. Code standards (summary — full version in `docs/CODING_STANDARDS.md`)

- **Build shared components.** Before writing a new UI element or helper, search
  `packages/ui` and `packages/shared`. If something similar exists, extend it.
  Three near-duplicates means one abstraction was missed.
- **Files under ~300 lines.** Longer means it is doing too much.
- **Named exports only.** No default exports (except React page components).
- **No `any`.** Use `unknown` and narrow it.
- **All external input validated with Zod** at the boundary (IPC handlers, file
  imports). Never trust data crossing a process boundary.
- **Errors are typed and handled.** No silent `catch {}`.
- **User-facing strings go through i18n from day one.** Urdu is coming.

---

## 10. Things that are deliberately NOT being built yet

Do not build these. If you think one is needed, stop and ask.

- Cloud sync / multi-device
- Multi-tenancy beyond the `tenant_id` column
- Double-entry accounting
- FBR e-invoicing (columns exist as a seam; no logic)
- Analytics dashboards beyond the fixed reports in `docs/PHASES.md`
- Barcode scanning
- Mobile app
- A metadata-driven module/permission engine — **permissions are code, not data**

---

## 11. Open questions blocking design

Tracked in `PROJECT.md` §Open Questions. Do not invent answers.

Currently open:

- Gas sold by cylinder or by weight?
- Are empty cylinders returnable / on deposit?
- Wholesale price: fixed / % off retail / negotiated?
- Which items genuinely need serial tracking?
- Fridge warranty work — who pays parts?
