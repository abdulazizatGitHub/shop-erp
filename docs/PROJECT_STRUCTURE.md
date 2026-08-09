# Project Structure

> Read alongside `docs/ARCHITECTURE.md`. This document defines **where code
> goes**. `ARCHITECTURE.md` defines **why**.

---

## 1. One repository, two applications

The repo is a monorepo. It contains **two separate applications** plus shared
packages.

```
apps/client   FRONTEND — React UI. Sandboxed browser context.
apps/server   BACKEND  — Electron main process. Owns the database.
```

They are as separate as two repos would make them, but with one advantage two
repos cannot give you: **shared, compile-time-checked types.** Change
`CreateSaleInput` and the frontend fails to compile immediately.

### There is no HTTP server

This is a desktop application. `apps/server` is the Electron **main process**,
not a web server. It does not listen on a port.

**Do not add Express, Fastify, or any HTTP listener to the desktop build.** A
listening port on a shop PC exposes the whole database to the shop's LAN.

The transport is Electron IPC. The layering is identical to a web API:

| Web API               | This project                | Lives in                          |
| --------------------- | --------------------------- | --------------------------------- |
| Route (`POST /sales`) | IPC channel (`sale:create`) | `apps/server/src/ipc/channels.ts` |
| Controller            | Handler                     | `apps/server/src/ipc/handlers/`   |
| Middleware            | Handler pipeline            | `apps/server/src/ipc/middleware/` |
| DTO / request schema  | Contract (Zod)              | `packages/contracts/`             |
| Service               | Service                     | `packages/core/`                  |
| Repository / model    | Repository                  | `packages/db/repositories/`       |

**Because the transport is separated from the services, cloud mode later is a
new adapter — `apps/api` calling the same `packages/core` — not a rewrite.**
That is the entire reason for this layering. Do not put business rules in a
handler.

---

## 2. Dependency direction

```
apps/client  ──►  packages/contracts  ◄──  apps/server
      │                   ▲                     │
      └──► packages/ui    │                     ▼
      └──► packages/shared ┘              packages/core
                                                │
                                          packages/db
                                                │
                                          packages/shared
```

**Enforced by ESLint. Violations fail CI.**

| Package     | May import                                    | Must never import                     |
| ----------- | --------------------------------------------- | ------------------------------------- |
| `shared`    | nothing                                       | anything                              |
| `contracts` | `shared`, zod                                 | `core`, `db`, `ui`, electron          |
| `db`        | `shared`, `contracts`                         | `core`, electron, react               |
| `core`      | `shared`, `contracts`, `db` (interfaces only) | electron, react, `ui`                 |
| `ui`        | `shared`, react                               | `core`, `db`, `contracts`             |
| `client`    | `shared`, `contracts`, `ui`, react            | `core`, `db`, electron, node builtins |
| `server`    | everything                                    | react, `ui`                           |

If you need to break one of these, **stop and ask.** It usually means logic is
in the wrong layer.

---

## 3. Backend — `apps/server`

```
apps/server/src/
├── main.ts                  Electron entry. Window lifecycle only.
├── preload.ts               contextBridge. The ONLY renderer↔main surface.
│
├── bootstrap/
│   ├── database.ts          Open DB, set pragmas, run migrations
│   ├── settings.ts          Load tenant + device config
│   └── container.ts         Wire repositories → services → handlers
│
├── ipc/
│   ├── channels.ts          Single source of truth for channel names + types
│   ├── register.ts          Registers every handler. One place to see the API.
│   │
│   ├── middleware/
│   │   ├── with-auth.ts     Role check. THE security boundary.
│   │   ├── with-validation.ts  Zod parse of the payload
│   │   ├── with-logging.ts  Request/response/duration
│   │   ├── with-audit.ts    Writes audit_log for mutations
│   │   ├── with-error.ts    Domain error → { code, message, details }
│   │   └── compose.ts       Pipeline composer
│   │
│   └── handlers/
│       ├── sale.handler.ts
│       ├── item.handler.ts
│       ├── party.handler.ts
│       ├── purchase.handler.ts
│       ├── payment.handler.ts
│       ├── expense.handler.ts
│       ├── report.handler.ts
│       ├── import.handler.ts
│       └── backup.handler.ts
│
├── printing/                Thermal 80mm + A4. Never inside a transaction.
├── backup/                  Encrypted copy, rotation, restore
├── import/                  Excel/CSV read → dry-run report → commit
└── logging/                 Rotating file logger
```

### Handlers are thin. Non-negotiable.

```ts
// apps/server/src/ipc/handlers/sale.handler.ts
export function registerSaleHandlers(deps: Deps): void {
  handle(
    channels.sale.create,
    compose(
      withLogging(),
      withAuth(['owner', 'manager', 'salesman']),
      withValidation(CreateSaleInput), // from packages/contracts
      withAudit('sale'),
      withError(),
    ),
    async (input, ctx) => deps.saleService.create(input, ctx),
  );
}
```

A handler does exactly four things: name the channel, declare the pipeline,
call **one** service method, return. **If a handler contains an `if` about
business rules, that rule is in the wrong file.**

### Middleware order matters

`logging → auth → validation → audit → error`

Auth before validation: an unauthorised caller should be rejected before you
spend time parsing their payload, and before anything is logged as a real
attempt.

---

## 4. Frontend — `apps/client`

```
apps/client/src/
├── main.tsx
├── app/
│   ├── App.tsx
│   ├── router.tsx
│   ├── providers.tsx        QueryClient, i18n, theme, error boundary
│   └── shortcuts.ts         Global keyboard map — this app is keyboard-first
│
├── pages/
│   ├── sales/               SaleScreen, SaleLineGrid, PaymentPanel, ReceiptPreview
│   ├── items/               ItemList, ItemForm, StockView, ImportWizard
│   ├── parties/             CustomerList, LedgerView, PaymentEntry
│   ├── reports/             DailySales, Receivables, StockValuation, CashBook
│   └── settings/            Users, PriceLevels, BusinessUnits, Backup
│
├── components/
│   ├── layout/              AppShell, Sidebar, TopBar, PageHeader
│   ├── forms/               MoneyInput, QuantityInput, ItemPicker, PartyPicker, DateInput
│   └── data/                DataTable, LedgerTable, SummaryCard, EmptyState
│
├── hooks/                   useSale, useItemSearch, useHotkey, useDebounce
├── lib/
│   ├── ipc.ts               Typed wrapper over window.api. ONLY place it is touched.
│   ├── query-keys.ts
│   └── format.ts            Re-exports Money.format / Qty.format. No new formatting.
├── stores/                  Zustand: UI state only. Never server data.
├── styles/                  index.css, tailwind layers
├── i18n/en/, i18n/ur/       Translation keys. No hardcoded strings, from day one.
└── types/                   Frontend-only view types
```

### Page vs component

- `pages/` — knows about business flow, calls IPC, owns page state.
- `components/` — receives props, emits events, **no IPC calls, no business rules**.
- `packages/ui` — reusable across pages, **no domain knowledge at all**.

Rule of thumb: if it mentions "sale", "udhaar", or "customer", it is not
`packages/ui`. A `DataTable` is; a `LedgerTable` is not.

### Server state

Use TanStack Query for anything from the backend. **Never put server data in
Zustand** — you will get two sources of truth and stale balances on screen,
which for this app means showing a shopkeeper the wrong udhaar figure.

---

## 5. Shared packages

### `packages/contracts` — the API surface

Zod schemas plus inferred types. The **only** thing both sides import for data
shapes. This is what makes a breaking change a compile error.

```ts
// packages/contracts/src/sale/create-sale.ts
export const CreateSaleInput = z.object({
  customerId: z.string().uuid().nullable(),
  priceLevelId: z.string().uuid(),
  lines: z.array(SaleLineInput).min(1),
  paidPaisa: z.number().int().nonnegative(),
  paymentMode: z.enum(['cash', 'credit', 'bank', 'easypaisa', 'jazzcash']),
});
export type CreateSaleInput = z.infer<typeof CreateSaleInput>;
```

### `packages/core` — business logic, one folder per domain

```
core/src/
├── sale/         sale.service.ts, sale.rules.ts, sale.types.ts
├── purchase/
├── stock/        movement.service.ts, valuation.service.ts
├── party/        ledger.service.ts, balance.service.ts
├── job/          job.service.ts, custody.service.ts     (Phase 6)
├── expense/
├── pricing/      price-resolver.ts  ← retail/wholesale/negotiated lives HERE
├── policies/     credit-limit.ts, negative-stock.ts, rounding.ts
└── errors/       InsufficientStockError, CreditLimitExceededError, ...
```

`policies/` exists so the rules the client keeps changing their mind about live
in one small, findable place — not scattered through services.

**Pure TypeScript. No Electron, no React, no SQL strings.** Services receive
repository _interfaces_, which makes them testable without a database.

### `packages/db` — the only place SQL is written

```
db/src/
├── connection.ts     pragmas (WAL, foreign_keys, synchronous=FULL)
├── migrate.ts        forward-only runner, backs up before applying
├── migrations/       0001_init.sql, 0002_business_units.sql
├── schema/           Kysely table types
├── repositories/     item.repo.ts, sale.repo.ts, stock.repo.ts, party.repo.ts
└── seed/             dev seed data only. NEVER client data.
```

Repositories do data access **only** — no business rules, no pricing, no
validation.

### `packages/ui` — presentation only

```
ui/src/
├── tokens/       colors.ts, typography.ts, spacing.ts  ← single source of truth
├── primitives/   Button, Input, NumberField, Select, Dialog, Toast, Table, Badge
└── patterns/     FormRow, PageHeader, EmptyState, LoadingState, ConfirmDialog
```

**`MoneyDisplay` and `MoneyInput` are the only components that format or parse
money.** No `/100` anywhere else in the codebase.

### `packages/shared` — zero dependencies

`Money` · `Qty` · `newId` · `formatDocNumber` · date helpers · text helpers.

---

## 6. Tailwind and design tokens

### The design brief, stated plainly

Users are shopkeepers and daily-wage technicians in Malakand, many with limited
literacy, on a low-spec PC in a bright shop, often standing, frequently in a
hurry, with a customer waiting. Some read Urdu only.

**The design goal is speed and legibility, not distinctiveness.** This is
deliberate: a fashionable interface that costs two seconds per sale is a worse
product here. Boldness is spent on one thing only — **making the current field
and the running total unmistakable at arm's length.**

### Tokens

Define once in `packages/ui/src/tokens/`, consume via Tailwind theme. **Never
use a raw hex or arbitrary Tailwind value (`text-[#1a1a1a]`) in a component.**

```js
// tailwind.config.js — extend, don't replace
theme: {
  extend: {
    colors: {
      ink:     { DEFAULT: '#14181F', muted: '#5A6472', faint: '#8B94A3' },
      surface: { DEFAULT: '#FFFFFF', sunken: '#F4F6F8', raised: '#FFFFFF' },
      line:    { DEFAULT: '#DFE4EA', strong: '#B8C0CC' },
      brand:   { DEFAULT: '#1B5E8C', hover: '#164E75', subtle: '#E7F0F6' },
      money:   { in: '#116149', out: '#A32B1F', due: '#8A5B00' },
      focus:   '#0B84FF',
    },
    fontFamily: {
      sans:   ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      urdu:   ['Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'serif'],
      mono:   ['JetBrains Mono', 'Consolas', 'monospace'],  // ALL numbers
    },
    fontSize: {
      // Larger than a typical web app. Counter use, not desk use.
      xs: ['13px', '18px'], sm: ['15px', '22px'], base: ['17px', '26px'],
      lg: ['20px', '28px'], xl: ['26px', '34px'], total: ['40px', '48px'],
    },
  },
}
```

Three rules that matter more than the palette:

1. **All numbers use the mono face and tabular figures** (`font-mono tabular-nums`).
   Columns of money must align on the decimal or they cannot be scanned.
2. **Money colour is semantic**: `money.in` received, `money.out` paid,
   `money.due` outstanding. Never decorative.
3. **Focus ring is always visible** (`focus:ring-2 ring-focus`). This app is
   driven by keyboard; an invisible focus state makes it unusable.

### Urdu

- `dir="rtl"` and `font-urdu` applied at the layout level, not per component.
- Use logical properties (`ps-4`, `me-2`), never `pl-4`/`mr-2`, or the RTL
  layout breaks.
- **Numbers and money stay LTR even in RTL layout.**

---

## 7. What the agent generates vs what you decide

| Agent generates                            | You decide (already decided — in this doc)      |
| ------------------------------------------ | ----------------------------------------------- |
| `npm create vite`, Tailwind init, tsconfig | Folder structure and layer boundaries           |
| Component boilerplate inside `packages/ui` | Which components exist and what they may know   |
| Repository CRUD methods                    | That repositories contain no business rules     |
| Test scaffolding                           | That money tests assert hand-calculated numbers |
| Migration file boilerplate                 | That stock and ledger are append-only           |

Let the agent run the generators. **Review the boundaries, not the boilerplate.**
