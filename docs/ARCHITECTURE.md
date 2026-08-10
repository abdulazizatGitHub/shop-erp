> **Summary only.** The full design — layers, module map, IPC contract, key
> flows, deployment — is in [`SYSTEM_DESIGN.md`](./SYSTEM_DESIGN.md).

# System Architecture & Design

**Version:** 0.2 · **Date:** 2026-08-08 · Supersedes v0.1

---

## 1. What Electron actually is here

Electron is not "the frontend". It is a runtime giving the application two OS
processes. **There is no separate backend server, no HTTP, no port, no localhost.**

```
╔══════════════════════════════════════════════════════════════════╗
║  MAIN PROCESS  — this IS the backend                             ║
║  Full Node.js runtime, full OS access                            ║
║   • opens the SQLite file (better-sqlite3, synchronous)          ║
║   • runs ALL business logic and validation                       ║
║   • enforces authentication and permissions                      ║
║   • thermal printing, Excel import, encrypted backup             ║
║   • window and application lifecycle                             ║
╚═══════════════════════════════╤══════════════════════════════════╝
                                │  contextBridge / IPC
                 typed · Zod-validated · authorisation-checked
╔═══════════════════════════════▼══════════════════════════════════╗
║  RENDERER PROCESS  — this is the frontend                        ║
║  Sandboxed Chromium page. React + Vite.                          ║
║  nodeIntegration:false · contextIsolation:true · sandbox:true    ║
║  NO database. NO filesystem. NO node modules.                    ║
╚══════════════════════════════════════════════════════════════════╝
```

**IPC is the API layer.** Everything that would live in a REST controller lives
in an IPC handler: validate → authorise → call a service → map the result.
Treat the renderer as an untrusted client, because it is one.

---

## 2. Layered architecture

```
┌──────────────────────────────────────────────────────────────┐
│ L4  PRESENTATION            apps/client, packages/ui         │
│     React screens, shared components, formatting, i18n       │
│     Knows nothing about SQL or domain rules                  │
└───────────────────────────┬──────────────────────────────────┘
                            │ typed IPC contract
┌───────────────────────────▼──────────────────────────────────┐
│ L3  APPLICATION             apps/server/src/ipc              │
│     Handlers. Zod validation, authorisation, orchestration.  │
│     THIN. No business rules live here.                       │
└───────────────────────────┬──────────────────────────────────┘
                            │ service interfaces
┌───────────────────────────▼──────────────────────────────────┐
│ L2  DOMAIN                  packages/core                    │
│     Pure TypeScript. Pricing, stock rules, ledger posting,   │
│     job costing, business-unit attribution.                  │
│     No SQL, no Electron, no React. Fully unit-testable.      │
└───────────────────────────┬──────────────────────────────────┘
                            │ repository interfaces (ports)
┌───────────────────────────▼──────────────────────────────────┐
│ L1  PERSISTENCE             packages/db                      │
│     Kysely queries, migrations, transactions, row mapping.   │
│     THE ONLY PLACE SQL IS WRITTEN.                           │
└──────────────────────────────────────────────────────────────┘

  packages/shared — Money, Qty, Id, constants. Zero dependencies.
```

### Why the domain layer is pure

- Every pricing and stock rule is unit-testable in milliseconds, no fixtures.
- The same code can run in a future cloud server with different persistence.
- When a money bug appears, you point Claude Code at one small pure file
  instead of a screen-to-SQL tangle.

Repositories are **interfaces defined in `core`, implemented in `db`**.
Dependency inversion — `core` never imports `db`.

```ts
// packages/core/src/ports/stock-repository.ts
export interface StockRepository {
  getOnHand(itemId: Id, warehouseId: Id): Milli;
  appendMovements(movements: readonly NewStockMovement[]): void;
}
```

---

## 3. Module map

Modules are **vertical slices**. Each owns its rules, repository and screens.
Cross-module access goes through the other module's service, never its tables.

| Module     | Owns                                                   | Phase |
| ---------- | ------------------------------------------------------ | ----- |
| `platform` | auth, permissions, settings, backup, migrations, audit | 0     |
| `catalog`  | items, categories, brands, UoM, prices, serials        | 1     |
| `stock`    | movements, warehouses, valuation, adjustments          | 1     |
| `party`    | customers, suppliers, staff, ledger, balances          | 2     |
| `purchase` | purchases, payables, payments out                      | 2     |
| `sale`     | counter sale, pricing, udhaar, payments in             | 3     |
| `report`   | read-only projections and exports                      | 4     |
| `job`      | job cards, custody, parts issue, payer split           | 6     |
| `expense`  | expenses, cash sessions                                | 7     |
| `staff`    | attendance, wages, advances, commission                | 7     |

```
apps/server/src/
  main.ts                  bootstrap, window creation
  ipc/registry.ts          registers handlers, applies auth middleware
  ipc/sale.handlers.ts
  services/                composition root: wires core + db
  printing/  backup/

packages/core/src/
  catalog/pricing.service.ts     retail vs wholesale resolution
  stock/movement.rules.ts        append-only invariants
  sale/sale.service.ts           the most important file in the codebase
  job/job-costing.service.ts     business-unit attribution, payer split
  ports/                         repository interfaces

packages/db/src/
  connection.ts            pragmas — see DATABASE_RULES §1
  migrations/  repositories/  mappers/
```

---

## 4. The critical design: two business units

**This is why the system exists. Every choice below serves it.**

### Attribution by line tagging (ADR-0005)

```
Fridge repair, customer pays Rs 6,000
┌────────────────────────────────────────────────────────────┐
│ sale                                                       │
│ ├─ line 1  Gas R-134a 0.4 kg  @1,680   unit = SPARE PARTS  │
│ │          cost snapshot 1,240      →  parts margin   440  │
│ └─ line 2  Gas charging labour @1,200  unit = REPAIR       │
│            technician commission 200 →  repair margin 1,000│
└────────────────────────────────────────────────────────────┘
     Spare Parts revenue 1,680   ·   Repair revenue 1,200
```

No internal transfer document. `v_job_split` reads this directly.

### The one exception: unbilled consumption

Free Dawlance installation → parts consumed, no customer line to tag.
An `internal_transfer` is posted at cost so Spare Parts is credited and Repair
carries the cost. **This is the only case that creates one.**

### Split payers (ADR-0007)

`payer_party_id` and `revenue_type` live on the **line**, not the job:

```
Dawlance new-AC installation
├─ Installation labour    payer = DAWLANCE   revenue_type = contract
└─ Extra pipe 12 ft       payer = CUSTOMER   revenue_type = customer_paid
```

Claims to Dawlance batch only lines where `payer = Dawlance`.

### Technician custody (ADR-0006)

A technician **is a warehouse**, not a debtor.

```
Shop ──transfer──▶ Naeem's bag ──job_issue──▶ Job #412
                        └──transfer back──▶ Shop  (unused)

Remaining balance = what he still physically holds.
Shortage → recorded as "noted" for a conversation. NEVER auto-deducted.
```

---

## 5. Write path — a counter sale, end to end

```
1. Renderer   window.api.sale.create(input)
2. Preload    forwards over IPC (the only bridge that exists)
3. Handler    Zod.parse(input)                  reject malformed
              requirePermission('sale.create')  reject unauthorised
4. Domain     pricing.resolve(customer, item)   price level applied
              stock.check(item, qty)            warn or block per policy
              credit.check(customer, total)     warn, do not block
5. ONE TRANSACTION (synchronous — never await inside):
              INSERT sale
              INSERT sale_line       (+ cost snapshot, + business_unit_id)
              INSERT stock_movement  (negative quantity)
              INSERT party_ledger    (if credit)
              INSERT audit_log
              INSERT sync_outbox
6. Commit
7. AFTER commit: print receipt      never inside the transaction
8. Return sale id
```

Rules encoded: validation precedes the transaction; no I/O inside it; nothing is
updated — six inserts, and balances are derived by summation.

---

## 6. Read path

Reads bypass the domain layer. Writes need rules; reads need speed.

```
Renderer ──IPC──▶ query handler ──▶ SQL view ──▶ DTO
```

Views: `v_stock_on_hand`, `v_party_balance`, `v_daily_sales`, `v_unit_pl`,
`v_job_split`, `v_technician_custody`.

DTOs carry money as **paisa integers**. Formatting happens only in
`MoneyDisplay` — never on the main-process side of the boundary.

---

## 7. Transport-agnostic services (keeps the LAN option open)

Services must not know they are called over IPC. Handlers are thin adapters.

```ts
// core — knows nothing about transport
export interface SaleService {
  create(input: CreateSaleInput, ctx: AuthContext): Promise<SaleResult>;
}

// desktop — IPC adapter (today)
ipcMain.handle('sale:create', (e, raw) =>
  saleService.create(CreateSaleInput.parse(raw), authContextFor(e)),
);

// hypothetical — HTTP adapter (second counter)
app.post('/sale', (req) =>
  saleService.create(CreateSaleInput.parse(req.body), authContextFor(req)),
);
```

**Cost today: near zero. Value if a second terminal appears: the entire sync
engine is deleted from the roadmap.**

---

## 8. Stack decision — Electron over Tauri (2026)

| Factor                  | Electron                        | Tauri v2   | Matters here?                       |
| ----------------------- | ------------------------------- | ---------- | ----------------------------------- |
| Installer size          | ~85–200 MB                      | ~3–10 MB   | No — installed in person from USB   |
| Idle RAM                | ~150–300 MB                     | ~30–60 MB  | Barely — one app, dedicated 8 GB PC |
| Cold start              | ~3s                             | ~1.4s      | Slightly — opened once per day      |
| Backend language        | TypeScript                      | **Rust**   | **Decisive**                        |
| Logic reusable in cloud | Yes                             | No         | Significant given SaaS ambition     |
| SQLite                  | better-sqlite3 (native rebuild) | SQL plugin | Minor Electron tax                  |
| Mobile                  | No                              | Yes        | Maybe 2027                          |

**Chosen: Electron.** Tauri's advantages are real and would likely win for a
consumer app, but each is close to irrelevant for a single-app dedicated shop
terminal, while its cost — a Rust backend — lands squarely on the project's
scarcest resource: the solo developer's ability to understand and debug money
code under pressure.

**Revisit if:** the client PC has under 8 GB RAM or an HDD; a technician mobile
app becomes firm; or `better-sqlite3` rebuild costs more than a day in P0-1.

---

## 9. Deployment topology

### Today — single terminal

```
┌──────── Shop PC (Windows 11, 8 GB, SSD, on a UPS) ────────┐
│  Electron app                                             │
│    └─ shop.db (SQLite, WAL) → %APPDATA%, not Program Files│
│  80mm thermal printer (USB)                               │
│  Backup → USB / synced folder, encrypted, 30-day cycle    │
└───────────────────────────────────────────────────────────┘
```

### If a second counter appears — decide BEFORE building sync

```
Option A (recommended)        Option B (avoid unless forced)
LAN client–server             Two installs + offline sync
  one DB, no sync               outbox/CRDT reconciliation
  services behind HTTP          weeks of work, hard to verify
```

**Open question for the client:** _will the repair desk and the parts counter
ever need separate machines?_ This single answer determines whether a sync
engine ever needs to exist. Ask before Phase 1.

### Future — optional cloud tier

```
Desktop (SQLite) ──sync_outbox──▶ API ──▶ Postgres (RLS, tenant_id)
```

Seams already built: `tenant_id` everywhere, UUIDv7 keys, device-coded document
numbers, `sync_outbox` populated from day one. **No logic yet — do not build it.**

---

## 10. Non-functional targets

| Concern         | Target                      | How                                                         |
| --------------- | --------------------------- | ----------------------------------------------------------- |
| Sale completion | < 30s, keyboard only        | Keyboard-first UI, indexed search                           |
| Item search     | < 100ms at 5,000 items      | Index on `(tenant_id, name_en)`; FTS5 only if measured slow |
| Startup         | < 5s on client hardware     | Measure on the real PC in week 1                            |
| Power cut       | Zero data loss              | WAL + `synchronous=FULL` + UPS; plug-pull ×10 in Phase 5    |
| Backup restore  | Verified on another machine | Tested in Phase 4 **and** Phase 5                           |
| Money accuracy  | Exact                       | Integer paisa; every test asserts a hand-calculated number  |
| Recovery        | Rebuildable                 | Stock and balances derivable from append-only tables alone  |
