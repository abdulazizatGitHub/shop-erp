# System Design

Supersedes the summary in `docs/ARCHITECTURE.md`. Read alongside
`docs/DATABASE_RULES.md` and the ADRs in `docs/decisions/`.

---

## 1. Process model

Electron ships **one application containing two processes**. There is no
separate server.

| Process      | Runtime              | Responsibility                                                                                  |
| ------------ | -------------------- | ----------------------------------------------------------------------------------------------- |
| **Main**     | Node                 | The backend. Database, business logic, printing, backup, import, logging. Owns the SQLite file. |
| **Renderer** | Chromium (sandboxed) | The UI only. React. No database, no filesystem, no Node APIs.                                   |

They communicate over **IPC through a narrow `contextBridge` API**. Treat that
boundary exactly as you would a public HTTP API: the renderer is untrusted, and
every handler validates its input.

`nodeIntegration: false` · `contextIsolation: true` · `sandbox: true`

When cloud sync arrives, the main process gains an **HTTP client**. It never
becomes an HTTP server.

---

## 2. Layers

```
  ┌─ Presentation ──────────── apps/renderer, packages/ui
  │    React screens, shared components, formatting, i18n
  │    Knows: nothing about SQL or domain rules
  │
  ├─ Boundary ──────────────── apps/desktop/src/ipc
  │    Zod schemas, permission checks, error serialisation
  │    Knows: how to translate untrusted input into domain calls
  │
  ├─ Domain ───────────────── packages/core
  │    Services: sale, purchase, stock, party, job, expense
  │    Pure TypeScript. No SQL, no Electron, no React.
  │    Knows: the business rules. This is where correctness lives.
  │
  ├─ Persistence ──────────── packages/db
  │    Repositories, migrations, transactions, row↔domain mapping
  │    The ONLY place SQL is written.
  │
  └─ Primitives ───────────── packages/shared
       Money, Qty, Id, constants, shared types. Zero dependencies.
```

**Dependency rule (lint-enforced):** each layer may only import the layer below
it. `core` may not import `db`'s driver, Electron, or React. `renderer` may not
import `core` or `db`.

**Why this matters beyond tidiness:** it is what makes the desktop shell
replaceable. If Electron proves too heavy on the client's hardware, `core`,
`db` and `shared` survive a move to Tauri or .NET unchanged. The shell is the
cheap part.

---

## 3. Module map

Modules are **vertical slices**, each owning a domain area end to end. A module
is a folder in `core`, a set of repositories in `db`, a set of IPC handlers, and
a set of screens.

| Module     | Owns                                                    | Phase |
| ---------- | ------------------------------------------------------- | ----- |
| `catalog`  | Items, categories, brands, UoM, price levels, serials   | 1     |
| `stock`    | Stock movements, warehouses, valuation, adjustments     | 1     |
| `party`    | Customers, suppliers, staff, ledger, balances           | 2     |
| `purchase` | Purchases, supplier bills, payments out                 | 2     |
| `sale`     | Counter sale, pricing, credit, payments in              | 3     |
| `report`   | Read-only projections and exports                       | 4     |
| `printing` | Receipt and invoice rendering, printer discovery        | 4     |
| `backup`   | Encrypted backup, restore, retention                    | 4     |
| `job`      | Repair jobs, parts issue, technician custody, contracts | 6     |
| `payroll`  | Attendance, wages, advances, commission                 | 7     |
| `expense`  | Expense entry, categories, cash sessions                | 7     |

**Cross-module rule:** modules talk through **service interfaces**, never by
reaching into each other's repositories. `sale` asks `stock` whether an item is
available; it does not query `stock_movement` itself.

---

## 4. The two-unit model

The defining design constraint. See ADR-0005, ADR-0007, ADR-0010.

**Spare Parts and Repair are PEERS.** Neither sits under the other. They are two
sibling rows in `business_unit`, each with a complete profit and loss, both
inside one business and one database. A third row, `SHARED`, holds costs that
belong to neither.

```
                    ONE BUSINESS (one tenant, one database)
   ┌──────────────────────────────┬──────────────────────────────┐
   │        SPARE PARTS           │           REPAIR             │
   │  owns all stock              │  owns no stock               │
   │  revenue: parts sold         │  revenue: labour, service    │
   │  costs:   COGS, salesman     │  costs:   technician wages   │
   │  own P&L                     │  own P&L                     │
   └──────────────────────────────┴──────────────────────────────┘
   ┌───────────────────────────────────────────────────────────────┐
   │  SHARED — rent, electricity, shop maintenance, owner drawings │
   │  allocated to the two units at REPORT time, never on write    │
   └───────────────────────────────────────────────────────────────┘
```

### How one transaction splits between peers

A counter sale is entirely Spare Parts. A pure AC service is entirely Repair. A
repair job that consumes parts produces **one invoice whose lines are tagged to
different units**:

| Line                | Unit   | Revenue to  | Cost to                  |
| ------------------- | ------ | ----------- | ------------------------ |
| Gas 0.4 kg          | PARTS  | Spare Parts | Spare Parts (COGS)       |
| Copper pipe 10 ft   | PARTS  | Spare Parts | Spare Parts (COGS)       |
| Installation labour | REPAIR | Repair      | Repair (technician wage) |

Physical stock still moves Spare Parts → technician → job. **That movement is
custody, not a sale.** The financial split happens on the invoice line.

### Three consequences

1. **Revenue separation is a line-level tag**, not a document.
   `v_unit_direct_margin` and `v_job_split` do the reporting.
2. **Payer is per line.** A Dawlance installation bills labour to Dawlance and
   extra pipe to the customer, on the same job (ADR-0007).
3. **Unbilled consumption is the only case that creates an `internal_transfer`** —
   free installation, warranty rework, shop's own use. Everything else must not.

### Two margin numbers, always shown together

| Number            | Meaning                                      | Status   |
| ----------------- | -------------------------------------------- | -------- |
| **Direct margin** | Unit revenue − unit COGS − unit direct costs | Fact     |
| **Net margin**    | Direct margin − allocated share of overhead  | Estimate |

Direct margin is the primary figure. Net margin depends on an allocation rule
the owner chose, so it must always be labelled as an estimate. Allocation is
computed at report time from `expense_category.allocation_method` — never by
writing split rows, or a changed policy could not be applied to past periods.

Technician custody is a **warehouse**, not a debt: Shop → Technician (transfer),
Technician → Job (`job_issue`). Shortages are noted for a conversation, never
auto-deducted (ADR-0006).

## 5. IPC contract

One namespaced channel per use case. Never a generic `db:query` channel — that
would hand the renderer arbitrary database access.

```ts
// apps/desktop/src/preload.ts — the entire renderer-visible surface
contextBridge.exposeInMainWorld('api', {
  item: { search, getById, create, update, importFile },
  stock: { onHand, movements, adjust },
  party: { search, getById, create, update, ledger, balance },
  sale: { create, getById, cancel, listByDate },
  purchase: { create, getById, cancel },
  payment: { receive, pay },
  report: { dailySales, receivablesAging, stockValuation, unitPl },
  print: { receipt, invoice, listPrinters },
  backup: { now, restore, list },
});
```

Every handler follows the same four steps, in order:

```ts
ipcMain.handle('sale:create', async (event, raw) => {
  const input = CreateSaleInput.parse(raw); // 1. validate — never trust
  requirePermission(event, 'sale.create'); // 2. authorise — in MAIN
  const sale = saleService.create(input); // 3. domain logic
  return toDto(sale); // 4. serialise
});
```

Errors cross the boundary as `{ code, message, details }`. Never a raw stack
trace. Permission checks live here, not in the UI — hiding a button is
convenience, not a control.

---

## 6. Key flow: a counter sale

```
Renderer                Main / IPC          core/saleService        db
   │                        │                      │                 │
   │ api.sale.create(input) │                      │                 │
   ├───────────────────────►│                      │                 │
   │                        │ Zod.parse            │                 │
   │                        │ requirePermission    │                 │
   │                        ├─────────────────────►│                 │
   │                        │                      │ resolve price   │
   │                        │                      │ check stock     │
   │                        │                      │ check credit    │
   │                        │                      │ compute totals  │
   │                        │                      │  (Money only)   │
   │                        │                      ├────────────────►│
   │                        │                      │   ONE TRANSACTION
   │                        │                      │   sale
   │                        │                      │   sale_line  (+cost snapshot)
   │                        │                      │   stock_movement (negative)
   │                        │                      │   party_ledger  (if credit)
   │                        │                      │   audit_log
   │                        │                      │   sync_outbox
   │                        │                      │◄────────────────┤
   │◄───────────────────────┴──────────────────────┤                 │
   │ saleId                                                          │
   │ api.print.receipt(saleId)   ← AFTER commit, never inside it      │
```

Two rules this flow encodes:

- **Validate before the transaction opens.** Transactions are synchronous with
  better-sqlite3 and must stay short. No I/O inside them.
- **Print after commit.** A printer jam must never roll back a sale, and a
  committed sale must never be lost because printing failed.

---

## 7. Read model

Reports read from **views**, not by re-implementing arithmetic in TypeScript.
Two implementations of "what does this customer owe" will eventually disagree,
and you will not know which is right.

| View                   | Answers                                           |
| ---------------------- | ------------------------------------------------- |
| `v_stock_on_hand`      | Current stock per item per warehouse              |
| `v_party_balance`      | Who owes what, in either direction                |
| `v_daily_sales`        | Sales, cash collected, credit given per day       |
| `v_unit_pl`            | Revenue, COGS, margin split by business unit      |
| `v_job_split`          | Per job: parts charged, parts cost, labour, payer |
| `v_technician_custody` | What each technician still physically holds       |

Add a materialised cache only when a report is **measured** as slow, and always
with a rebuild command.

---

## 8. Error and failure handling

| Failure                 | Behaviour                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Power cut mid-write     | WAL + `synchronous=FULL`. Verified by pull-plug test in Phase 5.                                            |
| Printer offline         | Sale is already committed. Show "reprint" — never block or reverse the sale.                                |
| Stock would go negative | Warn loudly, record the movement, surface on a report. Never silently block a real sale the shop just made. |
| Credit limit exceeded   | Warn, allow with owner override, log the override.                                                          |
| Import row invalid      | Reject that row with row number and column; import the rest; produce a reject report.                       |
| Renderer crash          | Main process survives; window reloads; no data lost.                                                        |
| Corrupt database        | Restore from the most recent backup. Restore path is tested in Phase 4, not assumed.                        |

The pattern throughout: **the shop's real-world transaction already happened.**
Software that refuses to record reality gets bypassed, and then the data is
worthless. Record it, flag it, let a human resolve it.

---

## 9. Deployment

```
Build (CI, Windows runner)
   └─ electron-builder → NSIS installer (.exe), code-signed
        ├─ app.asar (renderer bundle + main bundle)
        ├─ better-sqlite3 native binary, rebuilt for Electron's Node ABI
        └─ migrations/*.sql

Install (shop PC)
   ├─ %LOCALAPPDATA%\ShopERP\            application
   ├─ %APPDATA%\ShopERP\shop.db          data — never in Program Files
   ├─ %APPDATA%\ShopERP\backups\         30-day rotation
   └─ %APPDATA%\ShopERP\logs\
```

- First install by **USB**. Internet is not assumed.
- Updates via `electron-updater` differential patches once online.
- Migrations run at startup, **after an automatic backup**, inside a transaction.
- The database is never placed inside the install directory — reinstalling or
  updating must never touch client data.

---

## 10. What is deliberately not in this design

Every item here is a seam that exists in the schema with no logic behind it.
Building the logic early is the most likely way this project fails.

| Not built               | Seam already present                                |
| ----------------------- | --------------------------------------------------- |
| Cloud sync              | `sync_outbox`, UUIDv7 ids, device-coded doc numbers |
| Multi-tenancy           | `tenant_id` on every table                          |
| FBR e-invoicing         | `is_fiscal`, `fbr_*`, `tax_rate`, `tax_amount`      |
| Double-entry accounting | `party_ledger` is already an append-only journal    |
| Multi-branch            | `warehouse` table                                   |
| Mobile technician app   | `warehouse_kind = 'technician'`, job status history |
