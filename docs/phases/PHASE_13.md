# Phase 13 — Customer Ledger, Invoice Modal, Payment Receipt, Customer Statement, Add Customer, Import Balances

**Status:** COMPLETE — all CL-0a–CL-10 built and automated-verified, plus a
follow-on renderer-only polish series on the customer screens (see §9); owner
visually confirmed all six §7 screens plus the polish series on the shop
machine on 2026-09-20.
**Started:** 2026-09-19
**Completed:** 2026-09-20 (CL-0a–CL-10 code 2026-09-19; polish series
2026-09-19; owner visual sign-off 2026-09-20)
**Branch:** main
**Baseline test count:** 569 (confirmed after fixing a stale native `better-sqlite3` build — see session note below; unrelated to this phase's code)
**Target test count:** baseline + 22 minimum — **actual: 598 (baseline + 29)**

---

## 1. Goal

The owner and staff can open any customer's record and see their complete
financial history — every credit sale, every payment, every opening balance —
in a single chronological ledger with a running balance. They can click any
sale row to see the full invoice, click any payment row to view or reprint
the payment receipt, generate a dated account statement for any period and
print it to hand to the customer, and add new customers directly from the
Customers screen without touching a CSV file.

Every printed document — sale invoice, payment receipt, customer statement —
draws its shop identity header and footer from a single source of truth.
Adding the shop phone number or a return policy to settings once propagates
to every document automatically.

---

## 2. Scope

### In scope

| ID    | Task                                              |
| ----- | ------------------------------------------------- |
| CL-0a | Shop identity backend + settings page update      |
| CL-0b | DocumentHeader / DocumentFooter / DocumentSection |
| CL-1  | Customer ledger query + tests                     |
| CL-2  | Ledger contracts                                  |
| CL-3  | IPC: `customer:ledger`                            |
| CL-4  | `sale:getWithLines` (conditional — see §5.CL-4)   |
| CL-5  | Customer detail page                              |
| CL-6  | Sale invoice modal                                |
| CL-7  | Payment receipt document + modal                  |
| CL-8  | Customer statement PDF                            |
| CL-9  | Add customer form                                 |
| CL-10 | Customer import balances — Option B conversion    |

**Build order is strict:**

```
CL-0a → CL-0b → CL-1 → CL-2 → CL-3 → CL-4 (if required)
→ CL-5 → CL-6 → CL-7 → CL-8 → CL-9 → CL-10
```

`npm run verify` must be green and pasted in PROGRESS.md after every task
before the next begins.

### Explicitly out of scope

- Full settings overhaul (per-module settings, logo upload) — later phase
- `payment_allocation` / invoice-level payment application — separate decision
- Any change to the sale screen, purchase screen, or job screen
- Any new schema migration — this phase uses only existing tables

---

## 3. Binding constraints

Copied from CLAUDE.md. Non-negotiable on every line written this phase.

1. Money is INTEGER paisa. Variables end in `Paisa`. No float. No `/100`
   outside `MoneyDisplay`. `Money.fromRupees()` is the only Rs→paisa
   conversion point.
2. Quantity is INTEGER milli-units. Variables end in `Milli`.
3. `party_ledger` and `stock_movement` are APPEND-ONLY. No UPDATE. No DELETE.
4. Every multi-table write is one synchronous better-sqlite3 transaction.
   No `await` inside. No I/O inside.
5. All IPC input validated with Zod at the handler boundary before anything else.
6. No business logic in SQL. No stored procedures. No CHECK constraints.
7. UUIDs are UUIDv7, generated with `newId()` from `@shop/shared`.
8. `tenant_id` on every row. Every query filters by `tenantId`.
9. No file over 300 lines. React components over 200 lines must be split.
10. `MoneyDisplay` and `Money.fromRupees()` are the only money formatting/
    conversion points. No ad-hoc arithmetic on display values.
11. `sale_line.description` is a snapshot taken at sale time. Never re-join
    to the live `item` table for historical document display.
12. No new npm dependency without explicit owner approval.

---

## 4. Task table

| ID    | Task                                     | Status | Commit |
| ----- | ---------------------------------------- | ------ | ------ |
| CL-0a | Shop identity backend + settings update  | DONE   | —      |
| CL-0b | DocumentHeader/Footer/Section components | DONE   | —      |
| CL-1  | Customer ledger query + tests            | DONE   | —      |
| CL-2  | Ledger contracts                         | DONE   | —      |
| CL-3  | IPC: customer:ledger                     | DONE   | —      |
| CL-4  | sale:getWithLines (BUILT — required)     | DONE   | —      |
| CL-5  | Customer detail page                     | DONE   | —      |
| CL-6  | Sale invoice modal                       | DONE   | —      |
| CL-7  | Payment receipt document + modal         | DONE   | —      |
| CL-8  | Customer statement PDF                   | DONE   | —      |
| CL-9  | Add customer form                        | DONE   | —      |
| CL-10 | Import balances Option B conversion      | DONE   | —      |

Code-complete and automated-verified (typecheck, lint, 598/598 tests,
both workspace builds). **Owner visual confirmation of the running app
still pending** — see §7 exit criteria checkboxes below.

---

## 5. Detailed specifications

---

### CL-0a — Shop identity backend + settings update

**Purpose:** Single source of truth for all shop identity fields. Every
PDF generator and UI document component reads from here. When the full
settings phase ships, only this one file changes.

**New type — `packages/core/src/shop/shop-identity.ts`:**

```typescript
export interface ShopIdentity {
  shopName: string; // key: 'shopName'           default: 'Shop ERP'
  shopPhone: string | null; // key: 'shopPhone'
  shopAddress: string | null; // key: 'shopAddress'
  shopEmail: string | null; // key: 'shopEmail'
  invoiceHeaderText: string | null; // key: 'invoiceHeaderText'
  invoiceFooterText: string | null; // key: 'invoiceFooterText'
  statementFooterText: string | null; // key: 'statementFooterText'
}
```

Export from `packages/core/src/index.ts`.

**New repository function — `packages/db/src/repositories/shop-identity.repository.ts`:**

Reads all seven keys from the `setting` table in one query.
Returns a `ShopIdentity` object. `shopName` defaults to `'Shop ERP'`
if the key is missing. All other fields default to `null`.

> **[AGENT]** Confirm the Kysely column name for `setting.key` and
> `setting.value` by reading `kysely-schema.ts` before writing this function.
> The field may be camelCased. Use the real name.

**New IPC channel: `setting:getShopIdentity`**

Handler calls `getShopIdentity(db, tenantId)` and returns `ShopIdentityDto`.
Wire into `channels.ts`, `main.ts`, `preload.ts`, `electron-api.d.ts`.

**Refactor existing PDF generators:**

Find every file that reads `shopName` directly from the setting table:

```bash
grep -rn "shopName\|getShopName" \
  packages/db/src/repositories/receipt.repository.ts \
  packages/db/src/repositories/invoice.repository.ts
```

For each hit: remove the per-function setting read. The handler now calls
`getShopIdentity(db, tenantId)` once and passes the result through to the
repository function as a parameter.

**Settings page update:**

Find the existing "Shop identity" / "Shop name" card on `SettingsPage.tsx`.
Add fields for: Phone, Address (textarea), Email, Invoice header text
(textarea), Invoice footer text (textarea), Statement footer text (textarea).

> **[AGENT]** Read `setting.handler.ts` before adding save channels. Follow
> the exact existing pattern for setting getters/setters — do not invent
> a new pattern.

**Tests (TDD — real temp-SQLite-DB):**

1. Returns `shopName` default `'Shop ERP'` when key is missing from DB
2. Returns all seven fields correctly when all keys are present
3. Returns `null` for optional fields when those keys are absent

After CL-0a: `npm run verify` must equal baseline + 3. Paste output.

---

### CL-0b — DocumentHeader / DocumentFooter / DocumentSection

**Purpose:** Composable, flexible shared components used by every on-screen
document preview. No business logic. Accept Tailwind classes, layout variants,
slots, and children so each document can customise them without forking.

**Files — all in `packages/ui/src/patterns/`:**

- `DocumentHeader.tsx`
- `DocumentFooter.tsx`
- `DocumentSection.tsx`

Export all three from `packages/ui/src/patterns/index.ts`.

**`ShopIdentityContext.tsx` — in `apps/client/src/context/`:**

Fetches `ipc.setting.getShopIdentity()` once on first mount. Stores the
result in React context. All document components read from `useShopIdentity()`
— no component fetches shop identity independently.

Mount `ShopIdentityProvider` in `App.tsx` at the root level, wrapping
existing content. One fetch for the entire application lifetime.

**`DocumentHeader` props:**

```typescript
interface DocumentHeaderProps {
  className?: string;
  layout?: 'stacked' | 'row' | 'row-reverse'; // default: 'stacked'
  children?: React.ReactNode;
  slots?: {
    logo?: React.ReactNode; // future: shop logo image
    extra?: React.ReactNode; // e.g. invoice number block, document type label
  };
}
```

Behaviour:

- Reads from `useShopIdentity()`. If null (loading), renders a skeleton — never crashes.
- Always renders `shopName`.
- Conditionally renders `shopPhone`, `shopAddress`, `shopEmail`,
  `invoiceHeaderText` — only when non-null.
- `layout` controls the flex direction of the outer container.
- `className` is applied to the outer container.
- `slots.logo` renders before the shop identity block.
- `slots.extra` renders after the shop identity block.
- `children` renders last inside the container.

Layout class map:

```typescript
const LAYOUT = {
  stacked: 'flex flex-col gap-1',
  row: 'flex flex-row items-start gap-6',
  'row-reverse': 'flex flex-row-reverse items-start gap-6',
};
```

**`DocumentFooter` props:**

```typescript
interface DocumentFooterProps {
  className?: string;
  layout?: 'stacked' | 'row' | 'row-reverse'; // default: 'stacked'
  text?: string; // overrides shop.invoiceFooterText when provided
  showGeneratedDate?: boolean; // default: false
  children?: React.ReactNode;
}
```

Renders `text` prop when provided; otherwise `shop.invoiceFooterText`.
Renders nothing for the text section if both are null.
`showGeneratedDate` appends "Generated {today}" in muted small text.
`children` renders between the text and the generated date.

**`DocumentSection` props:**

```typescript
interface DocumentSectionProps {
  title?: string;
  className?: string;
  layout?: 'stacked' | 'row' | 'grid-2'; // default: 'stacked'
  children: React.ReactNode;
}
```

Layout class map:

```typescript
const SECTION_LAYOUT = {
  stacked: 'flex flex-col gap-1',
  row: 'flex flex-row gap-6',
  'grid-2': 'grid grid-cols-2 gap-4',
};
```

**No new tests required for CL-0b** — presentational components with no
business logic. After CL-0b: `npm run verify` must equal CL-0a count
(unchanged). Paste output.

---

### CL-1 — Customer ledger query

> **[AGENT]** Check `wc -l packages/db/src/repositories/party.repository.ts`
> from the pre-work. If under 260 lines, add the method there. Otherwise
> create `packages/db/src/repositories/customer-ledger.repository.ts`.

**Method:** `getCustomerLedger(customerId: string): CustomerLedgerRowRecord[]`

Verify the exact column names against the DDL output from pre-work before
writing the Kysely query. Do not assume — confirm:

- `sale.paid_amount` (or the real column name)
- `sale.discount_amount` (or the real column name)
- `sale.total_amount` (or the real column name)
- `payment.method` (or the real column name)
- `payment.reference_no` (or the real column name)

**SQL intent:**

```sql
SELECT
  pl.id, pl.entry_date, pl.entry_type,
  pl.amount AS amount_paisa,
  pl.bill_reference, pl.bill_notes,
  pl.source_type, pl.source_id,

  -- sale fields (NULL when source is not a sale)
  s.doc_no          AS sale_doc_no,
  s.total_amount    AS sale_total_paisa,
  s.paid_amount     AS sale_paid_paisa,
  s.discount_amount AS sale_discount_paisa,
  s.status          AS sale_status,
  s.payment_mode    AS sale_payment_mode,

  -- payment fields (NULL when source is not a payment)
  pay.doc_no        AS payment_doc_no,
  pay.amount        AS payment_amount_paisa,
  pay.method        AS payment_method,
  pay.reference_no  AS payment_reference_no,

  -- running balance via window function
  SUM(pl.amount) OVER (
    PARTITION BY pl.party_id
    ORDER BY pl.entry_date ASC, pl.id ASC
  ) AS running_balance_paisa

FROM party_ledger pl
LEFT JOIN sale s
  ON pl.source_type = 'sale' AND pl.source_id = s.id
LEFT JOIN payment pay
  ON pl.source_type = 'payment' AND pl.source_id = pay.id

WHERE pl.party_id = :customerId
  AND pl.tenant_id = :tenantId
ORDER BY pl.entry_date DESC, pl.id DESC
```

**Tests (TDD — write failing test first every time):**

1. Empty ledger → `[]`
2. Credit sale row → `saleDocNo` populated, `paymentDocNo` null, `amountPaisa > 0`
3. Payment row → `paymentDocNo` populated, `saleDocNo` null, `amountPaisa < 0`
4. Running balance accumulates correctly:
   Seed sale `+50,000 paisa` on `'2026-09-01'`, payment `−20,000 paisa`
   on `'2026-09-10'`. Assert `result[0].runningBalancePaisa === 30,000`.
   Comment: `// 50,000 + (−20,000) = 30,000 paisa`
5. Date ordering — two rows on different dates, newer date is `result[0]`

After CL-1: `npm run verify` must equal baseline + 5 minimum. Paste output.

---

### CL-2 — Ledger contracts

**Add to `packages/contracts/src/party/customer.ts`:**

```typescript
export const CustomerLedgerInput = z.object({
  customerId: z.string().uuid(),
});
export type CustomerLedgerInput = z.infer<typeof CustomerLedgerInput>;

export const CustomerLedgerRowDto = z.object({
  id: z.string(),
  entryDate: z.string(),
  entryType: z.string(),
  amountPaisa: z.number().int(),
  runningBalancePaisa: z.number().int(),
  billReference: z.string().nullable(),
  billNotes: z.string().nullable(),
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable(),
  saleDocNo: z.string().nullable(),
  saleTotalPaisa: z.number().int().nullable(),
  salePaidPaisa: z.number().int().nullable(),
  saleDiscountPaisa: z.number().int().nullable(),
  saleStatus: z.string().nullable(),
  salePaymentMode: z.string().nullable(),
  paymentDocNo: z.string().nullable(),
  paymentAmountPaisa: z.number().int().nullable(),
  paymentMethod: z.string().nullable(),
  paymentReferenceNo: z.string().nullable(),
});
export type CustomerLedgerRowDto = z.infer<typeof CustomerLedgerRowDto>;

export const CustomerStatementInput = z.object({
  customerId: z.string().uuid(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type CustomerStatementInput = z.infer<typeof CustomerStatementInput>;
```

**Add `ShopIdentityDto` to `packages/contracts/src/setting/setting.ts`**
(create the file if it does not exist):

```typescript
export const ShopIdentityDto = z.object({
  shopName: z.string(),
  shopPhone: z.string().nullable(),
  shopAddress: z.string().nullable(),
  shopEmail: z.string().nullable(),
  invoiceHeaderText: z.string().nullable(),
  invoiceFooterText: z.string().nullable(),
  statementFooterText: z.string().nullable(),
});
export type ShopIdentityDto = z.infer<typeof ShopIdentityDto>;
```

Export all new types from `packages/contracts/src/index.ts`.

After CL-2: `npm run typecheck` must be clean. Paste output.

---

### CL-3 — IPC: `customer:ledger`

Add `customer.ledger: 'customer:ledger'` to `channels.ts`.

> **[AGENT]** Check line count of `customer.handler.ts` from pre-work.
> If over 260 lines, create `customer-ledger.handler.ts` and register
> it separately in `main.ts`.

Handler follows the exact pattern of `customer.balance`:

```typescript
ipcMain.handle(
  channels.customer.ledger,
  withError(async (_event, raw: unknown) => {
    const input = CustomerLedgerInput.parse(raw);
    const db = openDatabase(deps.dbPath);
    try {
      const repo = new KyselyPartyRepository(createKyselyDb(db), deps.tenantId, deps.deviceCode);
      return await repo.getCustomerLedger(input.customerId);
    } finally {
      db.close();
    }
  }),
);
```

Wire into `main.ts`, `preload.ts`, `electron-api.d.ts`.

After CL-3: `npm run build --workspace=@shop/server` must exit 0. Paste output.

---

### CL-4 — `sale:getWithLines` (conditional)

> **[AGENT]** Read `packages/contracts/src/sale/sale.ts` from pre-work.
>
> If `SaleDto` already includes an array of sale lines (items, quantities,
> unit prices, line totals, descriptions), write **"CL-4: SKIPPED — SaleDto
> already includes lines"** in the task table and in PROGRESS.md. Proceed to CL-5.
>
> If `SaleDto` does NOT include lines, build:
>
> - New method in `invoice.repository.ts` (check line count first):
>   `getSaleWithLinesData(saleId: string)` — calls `getSaleInvoiceData`
>   internally. Compose, do not duplicate the query.
> - New contracts: `SaleWithLinesInput`, `SaleWithLinesDto`
> - New channel: `sale:getWithLines`
> - One test: seed a sale with two lines, call the method, assert both
>   lines are present and `totalAmountPaisa` is correct. Hand-calculate
>   the expected total in a comment.

---

### CL-5 — Customer detail page

**Navigation change in `CustomersPage.tsx`:**

```typescript
const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

if (selectedCustomerId) {
  return (
    <CustomerDetailPage
      customerId={selectedCustomerId}
      onBack={() => setSelectedCustomerId(null)}
    />
  );
}
return <CustomerListView onSelectCustomer={setSelectedCustomerId} ... />;
```

Row click in `CustomerListView` calls `onSelectCustomer(row.id)`. Remove
the per-row "Receive payment" button from the list — it moves to the
detail page header.

**New files (each under 300 lines — split further if approaching the limit):**

- `apps/client/src/pages/parties/CustomerDetailPage.tsx`
- `apps/client/src/pages/parties/CustomerStatCards.tsx`
- `apps/client/src/pages/parties/CustomerLedgerTable.tsx`

**Data fetching on mount (three parallel calls):**

```typescript
Promise.all([
  ipc.customer.get({ id: customerId }),
  ipc.customer.balance({ id: customerId }),
  ipc.customer.ledger({ customerId }),
]).then(([customer, balance, ledger]) => { ... })
  .catch(setError);
```

Show `<LoadingState />` while any call is pending. Show a plain error state
if any call fails. Do not crash.

**CustomerStatCards — four cards, all computed client-side:**

| Card               | Value          | How computed                                                                              |
| ------------------ | -------------- | ----------------------------------------------------------------------------------------- |
| Current balance    | `balancePaisa` | From `customer.balance` result                                                            |
| Open invoices      | count          | Ledger rows where `saleStatus === 'confirmed'` AND `(saleTotalPaisa - salePaidPaisa) > 0` |
| Total credit given | sum            | `SUM(amountPaisa)` where `amountPaisa > 0`                                                |
| Last activity      | date           | `max(entryDate)`                                                                          |

Balance card: red (`text-danger`) when > 0, green (`text-success`) when 0.

**CustomerLedgerTable columns:**

Date · Type badge · Reference · Description · Debit · Credit · Running balance

```typescript
// Type badge colour map
const BADGE_TONE = {
  sale:             'accent',
  opening_balance:  'neutral',
  payment_received: 'success',
  sale_return:      'warning',
} as const;

// Reference column
row.saleDocNo ?? row.paymentDocNo ?? row.billReference ?? '—'

// Description column (client-side derivation)
const DESCRIPTIONS = {
  sale:             'Credit sale',
  payment_received: 'Payment received',
  opening_balance:  'Opening balance',
  sale_return:      'Sale cancelled',
};
// default: row.entryType

// Debit column
row.amountPaisa > 0 ? <MoneyDisplay value={row.amountPaisa} /> : '—'

// Credit column
row.amountPaisa < 0 ? <MoneyDisplay value={Math.abs(row.amountPaisa)} /> : '—'

// Running balance
<MoneyDisplay value={row.runningBalancePaisa} tone="auto" />
```

Row click behaviour:

- `sourceType === 'sale'` → opens `SaleInvoiceModal` with `saleId = row.sourceId`
- `sourceType === 'payment'` → opens `PaymentReceiptModal` with `paymentId = row.sourceId`
- All other rows → not clickable, no hover cursor

**Page header:**

Left: back arrow (`← Customers`) · customer name · code chip · phone

Right: "Statement" (secondary) · "Receive payment" (primary)

"Receive payment" opens existing `RecordPaymentModal` passing
`partyId`, `customerName`, `currentBalancePaisa`. On success: re-run
all three `Promise.all` calls.

"Statement" opens `CustomerStatementModal` (built in CL-8).

---

### CL-6 — Sale invoice modal

**New file:** `apps/client/src/pages/parties/SaleInvoiceModal.tsx`

Props: `{ saleId: string | null; onClose: () => void }`

Fetches `ipc.sale.getWithLines({ id: saleId })` (or `ipc.sale.getById`
if CL-4 was skipped) when `saleId` is non-null. Shows `<LoadingState />`
while fetching. Shows a plain error message on failure — never crashes.

Modal size: `"wide"` (~560px).

**Layout structure using DocumentHeader / DocumentSection / DocumentFooter:**

```
DocumentHeader (layout="row")
  slots.extra = invoice number + date + status badge (right-aligned)

DocumentSection (title="Customer", layout="grid-2")
  Left: name, code chip
  Right: phone, payment mode label

Lines table
  Columns: Item | Qty | Unit price | Amount
  description = sale_line.description SNAPSHOT — never a live item join

Totals block
  Subtotal
  Discount        ← show only when saleDiscountPaisa > 0, in amber
  Total           ← bold
  Paid so far
  Balance due     ← red when > 0, green when 0, bold

DocumentFooter (uses shop.invoiceFooterText)

Modal footer buttons
  [Print invoice]  [Close]
```

**Print handler:**

```typescript
const handlePrint = async () => {
  if (!saleId) return;
  const result = await ipc.invoice.printSaleInvoice({ saleId });
  if (result.printError) toast.error(result.printError);
  // never close the modal — user may want to print again
};
```

> **[AGENT]** Confirm the exact channel name and input shape for
> `printSaleInvoice` by reading `channels.ts` before writing the call.

---

### CL-7 — Payment receipt document + modal

#### CL-7A — `getPaymentReceiptData`

> **[AGENT]** Check `wc -l packages/db/src/repositories/receipt.repository.ts`.
> If under 240 lines, add the method there. Otherwise create
> `packages/db/src/repositories/payment-receipt.repository.ts`.

```typescript
export interface PaymentReceiptData {
  docNo: string;
  paymentDate: string;
  amountPaisa: number;
  method: string;
  referenceNo: string | null;
  notes: string | null;
  customerName: string;
  customerCode: string;
  customerPhone: string | null;
  shopIdentity: ShopIdentity;
  previousBalancePaisa: number;
  remainingBalancePaisa: number;
}
```

**Query approach:**

1. Fetch payment row + JOIN `party` for customer fields.
2. Call `getShopIdentity(db, tenantId)`.
3. Run the window-function ledger query for this party. Find the row
   where `source_type = 'payment' AND source_id = :paymentId`.
   - `remainingBalancePaisa = running_balance_paisa`
   - `previousBalancePaisa = running_balance_paisa - amount_paisa`
     (amount_paisa is negative, so this adds back the payment amount)

**Tests (TDD):**

Test 1: Returns correct `docNo`, `customerName`, `amountPaisa`.

Test 2: Returns correct balance figures.
Seed: sale `+50,000 paisa` on `'2026-09-01'`, payment `−20,000 paisa`
on `'2026-09-10'`.
Assert `previousBalancePaisa === 50,000`.
Assert `remainingBalancePaisa === 30,000`.

```
// Running balance after sale:    50,000
// Running balance after payment: 50,000 + (−20,000) = 30,000
// previousBalance = runningAtPayment − paymentAmount
//                = 30,000 − (−20,000) = 50,000
// remainingBalance = runningAtPayment = 30,000
```

Test 3: Handles `customerPhone = null` without crashing.

#### CL-7B — `buildPaymentReceiptLayout`

**New file:** `packages/core/src/printing/payment-receipt-layout.ts`

Pure function — no pdfkit, no DB, no IPC.

```typescript
export interface PaymentReceiptLayoutData {
  shopSection: { name: string; phone: string | null; address: string | null };
  documentSection: { receiptNo: string; date: string; method: string; referenceNo: string | null };
  customerSection: { name: string; code: string; phone: string | null };
  paymentSection: {
    amountPaisa: number;           // large prominent display
    previousBalancePaisa: number;
    remainingBalancePaisa: number;
  };
  footerText: string | null;
}

export function buildPaymentReceiptLayout(
  data: PaymentReceiptData,
): PaymentReceiptLayoutData { ... }
```

**Tests (TDD):**

1. Layout contains receipt number and customer name.
2. `paymentSection` values match input data exactly.
3. `footerText` equals `data.shopIdentity.invoiceFooterText`.

#### CL-7C — PDF renderer + safe print orchestrator

**New file:** `apps/server/src/printing/payment-receipt-pdf.ts`

`renderPaymentReceiptPdf(data: PaymentReceiptData): Buffer`
Uses the same pdfkit drawing approach as `renderInvoicePdf`. Target A4.
Reuse drawing helpers from `renderInvoicePdf` via import — do not copy
pdfkit code between files.

`printPaymentReceiptSafely(paymentId, deps)` — same error-isolation
contract as `printInvoiceSafely`. Never throws. Returns
`{ filePath: string; printError: string | null }`.

#### CL-7D — IPC channels

Add to `channels.ts`:

- `payment.getReceipt: 'payment:getReceipt'`
- `print.printPaymentReceipt: 'print:printPaymentReceipt'`

`payment:getReceipt` — accepts `{ paymentId: string }`, returns
`PaymentReceiptData`.

`print:printPaymentReceipt` — accepts `{ paymentId: string }`, calls
`getPaymentReceiptData` then `printPaymentReceiptSafely`, returns
`{ printError: string | null }`.

> **[AGENT]** Check `wc -l` of `print.handler.ts` from pre-work. If
> over 260 lines after adding these two handlers, extract to a new
> `payment-receipt.handler.ts`.

Wire both into `main.ts`, `preload.ts`, `electron-api.d.ts`.

#### CL-7E — `PaymentReceiptModal`

**New file:** `apps/client/src/pages/parties/PaymentReceiptModal.tsx`

Props: `{ paymentId: string | null; onClose: () => void }`

Fetches `ipc.payment.getReceipt({ paymentId })` when set.

**Layout structure using DocumentHeader / DocumentSection / DocumentFooter:**

```
DocumentHeader (layout="row", compact)

DocumentSection (title="Receipt", layout="grid-2")
  Left: receipt number
  Right: date

DocumentSection (title="Customer", layout="stacked")
  name, code, phone

Payment amount box (prominent, centred, bg-success/10)
  Label: "Amount received"
  Large MoneyDisplay (text-success, font-bold, text-2xl)
  Method label below
  Reference number below (if present)

DocumentSection (title="Account summary", layout="stacked")
  Previous balance     Rs X
  Amount received     −Rs X   (green)
  Remaining balance    Rs X   (red if > 0, green if 0, bold)

DocumentFooter

Modal footer buttons
  [Print receipt]  [Close]
```

Print handler calls `ipc.print.printPaymentReceipt({ paymentId })`.
On error: `toast.error`. Never closes the modal.

#### CL-7F — Print trigger on `RecordPaymentModal` success state

> **[AGENT]** Read `RecordPaymentModal.tsx` before touching it.
> Confirm `PaymentDto` includes `id` by reading `payment.ts` in pre-work.
> If `id` is missing from `PaymentDto`, add it — the repository already
> returns it. Do not proceed without checking.

On successful submission, the success state already shows the document
number. Add a "Print receipt" button:

```tsx
{
  successResult && (
    <Button
      variant="secondary"
      onClick={() => ipc.print.printPaymentReceipt({ paymentId: successResult.id })}
    >
      Print receipt
    </Button>
  );
}
```

Non-blocking — print failure shows a toast, the success state is
never altered.

After CL-7: `npm run verify` must equal baseline + 8 minimum. Paste output.

---

### CL-8 — Customer statement PDF

#### CL-8A — `getCustomerStatementData`

Add to the same file as `getCustomerLedger` (CL-1).

```typescript
export interface CustomerStatementData {
  customer: { name: string; code: string; phone: string | null };
  shopIdentity: ShopIdentity;
  fromDate: string;
  toDate: string;
  openingBalancePaisa: number;
  rows: CustomerLedgerRowRecord[];
  closingBalancePaisa: number;
}

getCustomerStatementData(
  customerId: string,
  fromDate: string,
  toDate: string,
): CustomerStatementData
```

**Implementation:**

1. Fetch customer name/code/phone from `party`.
2. Call `getShopIdentity(db, tenantId)`.
3. `openingBalancePaisa` = `SUM(amount)` from `party_ledger` where
   `entry_date < fromDate` for this customer.
4. `rows` = `getCustomerLedger` logic with an added
   `WHERE entry_date BETWEEN fromDate AND toDate` filter.
   Extract a private helper so both methods share the same query
   without duplication.
5. `closingBalancePaisa = openingBalancePaisa + SUM(rows.amountPaisa)`

**Tests (TDD):**

Test 1: Opening balance = sum of rows strictly before `fromDate`.
Seed: two rows on `'2026-08-15'` (+20,000 and +10,000 paisa),
one row on `'2026-09-05'` (+5,000 paisa).
Call with `fromDate='2026-09-01'`, `toDate='2026-09-30'`.
Assert `openingBalancePaisa === 30,000`.

```
// 20,000 + 10,000 = 30,000
// The 2026-09-05 row is on or after fromDate — excluded from opening
```

Test 2: Rows returned are only within the date range (inclusive on both ends).
Using the same fixture: assert `rows.length === 1` and
`rows[0].amountPaisa === 5,000`.

Test 3: Closing balance is calculated correctly.
Assert `closingBalancePaisa === 35,000`.

```
// 30,000 (opening) + 5,000 (rows sum) = 35,000
```

#### CL-8B — `buildCustomerStatementLayout`

**New file:** `packages/core/src/printing/customer-statement-layout.ts`

Pure function — no pdfkit, no DB, no IPC.

Layout sections in order:

1. Shop identity section
2. Title: "Account Statement"
3. Customer: name, code, phone
4. Period: "From {fromDate} to {toDate}"
5. Opening balance row: "Balance brought forward: Rs X"
6. Transaction rows: Date · Type · Reference · Debit · Credit · Balance
7. Closing balance row: "Closing balance: Rs X"
8. Footer (from `shopIdentity.statementFooterText`)

No tests required — trivial string/number mappings, no business logic.

#### CL-8C — PDF renderer + safe print orchestrator

**New file:** `apps/server/src/printing/customer-statement-pdf.ts`

`renderCustomerStatementPdf(data: CustomerStatementData): Buffer` — same
pdfkit pattern as `renderInvoicePdf`. Target A4.

`printCustomerStatementSafely(...)` — same error-isolation contract.

#### CL-8D — IPC channels

Add to `channels.ts`:

- `customer.statement: 'customer:statement'`
- `print.printCustomerStatement: 'print:printCustomerStatement'`

`customer:statement` — accepts `CustomerStatementInput`, returns
`CustomerStatementData`.

`print:printCustomerStatement` — accepts
`{ customerId, fromDate, toDate }`, calls `getCustomerStatementData`
then `printCustomerStatementSafely`, returns `{ printError: string | null }`.

Wire both into `main.ts`, `preload.ts`, `electron-api.d.ts`.

#### CL-8E — `CustomerStatementModal`

**New file:** `apps/client/src/pages/parties/CustomerStatementModal.tsx`

Props: `{ customerId: string; customerName: string; onClose: () => void }`

**Default date range** — current month:

```typescript
const [fromDate, setFromDate] = useState(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
});
const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
```

No preset shortcuts — the date range inputs are the full interface.

**Layout:**

```
Title: "Account Statement — {customerName}"

[From: ____-__-__]  [To: ____-__-__]  [Load]

── Preview (shown after Load) ──────────────────

DocumentHeader (inside the preview area, before opening balance)

Opening balance row (amber background):
  "Balance b/f as of {fromDate}"  Rs X

Transaction table (same columns as CustomerLedgerTable)

Closing balance row (green/red per value):
  "Closing balance as of {toDate}"  Rs X

DocumentFooter (uses shop.statementFooterText)

[Print statement]  [Close]
```

Load handler calls `ipc.customer.statement(...)`. Print handler calls
`ipc.print.printCustomerStatement(...)`. Both non-blocking.

After CL-8: `npm run verify` must equal baseline + 11 minimum. Paste output.

---

### CL-9 — Add customer form

**New file:** `apps/client/src/pages/parties/AddCustomerModal.tsx`

Mirror of `AddSupplierModal.tsx` in structure and pattern.
Size: `"wide"`. Two-section layout separated by a `border-t` divider.

**Fields:**

```
Section 1 (grid 2 columns):
  Name *              Shop name (optional)
  Phone               Price level [Retail / Wholesale dropdown]

Section 2 (label "Additional details"):
  Credit limit (Rs)   [hint: "0 or empty = no limit"]
  City / area
  Notes               [textarea]
```

> **[AGENT]** Before writing any code, confirm `ipc.item.lookups()` returns
> a `priceLevels` array with `id` and `name` fields by reading the
> `ItemLookupsDto` contract. Fetch price levels on modal open to populate
> the dropdown.

On submit — run `blankToNull` on all optional string fields, then:

```typescript
await ipc.customer.create({
  partyCode: null,
  name: form.name,
  shopName: blankToNull(form.shopName),
  phone: blankToNull(form.phone),
  customerType: form.priceLevel === 'Wholesale' ? 'wholesale' : 'retail',
  priceLevelId: lookups.priceLevels.find((p) => p.name === form.priceLevel)?.id ?? null,
  creditLimitPaisa: form.creditLimit ? Money.fromRupees(parseFloat(form.creditLimit)) : null,
  notes: blankToNull(form.notes),
});
```

On success: close modal, show success toast with new customer code,
call `onSuccess()` so `CustomersPage` refreshes the list.

Add "Add customer" (primary) button to `CustomersPage.tsx` header —
same position as "Add supplier" on `SuppliersPage.tsx`.

**No new IPC channel. No new repository method. No new test.**
`customer:create` is fully tested from Phase 3. This is UI only.

---

### CL-10 — Customer import balances — Option B conversion

**First: find the current handler.**

```bash
grep -rn "customerBalance\|customer.*[Bb]alance\|CustomerBalance" \
  apps/server/src/ipc/handlers/
```

Read the file found. Confirm it uses `dialog.showOpenDialog` /
`readFileSync`. If it does not, document what it actually does and
stop — do not proceed without owner confirmation.

> **[AGENT]** Read `apps/server/src/ipc/handlers/supplier-balance-import.handler.ts`
> as the authoritative conversion template before writing any code.
> Read `ImportSuppliersModal.tsx` as the authoritative frontend template.
> Follow both exactly.

**Conversion steps:**

A. Add to `packages/contracts/src/party/customer.ts`:

```typescript
export const ImportCustomerBalanceInput = z.object({
  balancesCsv: z.string().min(1),
});
export type ImportCustomerBalanceInput = z.infer<typeof ImportCustomerBalanceInput>;
```

B. Rewrite the handler to accept `{ balancesCsv: string }` from the
renderer. Remove `dialog.showOpenDialog` and `readFileSync` entirely.
The CSV content now arrives from the renderer, not the main process.

C. Update the import modal component to read the file renderer-side,
matching `ImportSuppliersModal.tsx`'s exact file-reading pattern.

**Tests (real temp-SQLite-DB — same pattern as
`supplier-balance-import.handler.test.ts`):**

1. Commit inserts rows into `party_ledger`
2. Dry run inserts nothing
3. Bad column headers → rejected with a clear error message
4. Unmatched customer name → rejected, not silently skipped

After CL-10: `npm run verify` must equal baseline + 22 minimum.
Paste output.

Confirm zero remaining `dialog.showOpenDialog` references in the
customer balance import handler:

```bash
grep -n "showOpenDialog\|readFileSync" \
  apps/server/src/ipc/handlers/[the handler file]
```

Paste output — must be empty.

---

## 6. Design decisions

| Decision                                                                                  | Reasoning                                                                                                                                                        |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ShopIdentity` type in `packages/core`, `ShopIdentityDto` in `packages/contracts`         | `ShopIdentity` is used by PDF generators in `apps/server` which import from `@shop/core`. The DTO is the IPC transport type only.                                |
| `DocumentHeader`/`Footer`/`Section` in `packages/ui/src/patterns/`                        | Shared presentation primitives with no business logic, consistent with existing `EmptyState`, `ConfirmDialog`, `PageHeader`.                                     |
| `ShopIdentityContext` in `apps/client/src/context/`, not `packages/ui`                    | It calls IPC. `packages/ui` must never import IPC or app-layer code.                                                                                             |
| Window function for running balance in ledger query                                       | Computed in one query pass — no application-layer accumulation loop. SQLite supports window functions since 3.25 (Sept 2018).                                    |
| Statement opening balance is a separate `SUM` query, not derived from the window function | The window function only covers the rows returned for the date range. Opening balance must sum ALL rows before `fromDate` regardless of page or filter.          |
| `sale_line.description` snapshot used in invoice modal                                    | DATABASE_RULES.md rule: never re-join to the live `item` table for historical document display.                                                                  |
| PDF generators receive `ShopIdentity` as a parameter from the handler                     | The handler calls `getShopIdentity` once per request and passes it through. No PDF function reads from settings independently.                                   |
| `printPaymentReceiptSafely` and `printCustomerStatementSafely` never throw                | Print errors must not surface as uncaught exceptions that could obscure the underlying business transaction. Same contract as `printInvoiceSafely` from Phase 4. |
| `payment_allocation` not wired this phase                                                 | Requires a separate design decision on allocation strategy. The table exists but is inert. Deferred.                                                             |
| No date range presets on the statement modal                                              | Owner decision: from/to date inputs are sufficient and clean.                                                                                                    |

---

## 7. Exit criteria

All items must be checked before this phase is COMPLETE.
Each checkbox requires real pasted evidence — not "looks correct".

```
[x] npm run verify green at baseline before any code written — paste:
    Initial run: 281 failed / 288 passed — root cause: better-sqlite3
    native binary built for a different Node ABI (NODE_MODULE_VERSION
    130 vs the running Node's 127). Fixed with `npm rebuild
    better-sqlite3` (no source changes). Re-ran: 569/569, 99/99 files,
    exit 0. Matches PROJECT.md's last recorded Phase 12 count exactly.

[x] CL-0a complete — target verify = baseline + 3 — actual: baseline + 5
    (added setShopIdentity + 2 tests beyond the spec's 3 read-only
    tests, since the Settings page task requires the new fields to be
    saveable, not just readable — see §5 note). 574/574.
[x] CL-0b complete — verify unchanged from CL-0a — 574/574 confirmed.
[x] CL-1 complete — verify = baseline + 5 — 5 customer-ledger tests, all
    passing (579/579 combined with CL-0a).
    Running balance test comment present: 50,000 + (−20,000) = 30,000
[x] CL-2 complete — npm run typecheck clean — confirmed after CL-2 and
    again at the end of the full build.
[x] CL-3 complete — npm run build --workspace=@shop/server exits 0 —
    confirmed (dist/main, dist/preload, dist/renderer all built).
[x] CL-4 — BUILT (required) — SaleSummaryDto has no lines array;
    sale:getWithLines added with 1 test (hand-calculated total:
    400,000 + 100,000 = 500,000 paisa).
[x] CL-7 complete — target verify = baseline + 8 — actual: CL-7A (3) +
    CL-7B (3) = 6 new repository/layout tests (CL-7C/D/E/F are
    orchestration/UI wiring with no dedicated new tests, matching this
    project's precedent of not unit-testing IPC handlers directly).
    Previous balance test arithmetic comment present.
[x] CL-8 complete — target verify = baseline + 11 — actual: CL-8A added
    4 tests (opening/rows/closing/not-found).
    Opening balance test arithmetic comment present.
    Closing balance test arithmetic comment present.
[x] CL-10 complete — target verify = baseline + 22 — actual overall
    total: 598/598 (baseline + 29), comfortably over the minimum.
    grep for showOpenDialog/readFileSync in handler = empty — confirmed
    (grep exit code 1 — no matches).

[x] CustomerDetailPage — stat cards, ledger table, type badges
    Owner visual confirmation: CONFIRMED 2026-09-20, on the shop machine.
[x] SaleInvoiceModal — all lines, totals, balance due, print button works
    Owner visual confirmation: CONFIRMED 2026-09-20, on the shop machine.
[x] PaymentReceiptModal — previous/remaining balances correct
    Owner visual confirmation: CONFIRMED 2026-09-20, on the shop machine.
[x] RecordPaymentModal success state — print receipt button present and works
    Owner visual confirmation: CONFIRMED 2026-09-20, on the shop machine.
[x] CustomerStatementModal — date pickers, preview, print works
    Owner visual confirmation: CONFIRMED 2026-09-20, on the shop machine.
[x] AddCustomerModal — creates customer, code appears in list
    Owner visual confirmation: CONFIRMED 2026-09-20, on the shop machine.
[x] Polish series — CSV export downloads a real file that opens correctly,
    payment modal is wider and two-column, customer-screen cards are
    tighter/consistent
    Owner visual confirmation: CONFIRMED 2026-09-20, on the shop machine.

[x] Every money assertion in tests has hand-calculated expected value in comment
[x] wc -l ≤ 300 for every new file — paste all counts: all 35 new/heavily-
    modified files checked, largest is lookup.repository.ts at 251 lines
    and RecordPaymentModal.tsx at 242 lines — both under 300.
[x] All money displayed via MoneyDisplay — no ad-hoc /100 anywhere
[x] sale_line.description snapshot used — no live item join in SaleInvoiceModal
    (SaleWithLinesDto composes getSaleInvoiceData, which itself composes
    getSaleReceiptData's sl.description snapshot read — never re-joins item)
[x] ShopIdentityContext wraps App.tsx root — one fetch per app lifetime
[x] DocumentHeader/Footer used in SaleInvoiceModal, PaymentReceiptModal,
    CustomerStatementModal
[x] getShopIdentity used by all PDF generators added this phase
    (payment-receipt-pdf.ts, customer-statement-pdf.ts). Note:
    receipt.repository.ts/invoice.repository.ts — the two files CL-0a's
    own grep instruction named — had zero pre-existing shopName reads,
    so there was nothing to refactor there; purchase-print.repository.ts
    still reads getShopName directly but is out of this phase's file list.
[x] No new npm dependency
[x] npm run build --workspace=@shop/client exits 0 — confirmed
    (dist/index.html, assets/*.css, assets/*.js all built)
[x] npm run build --workspace=@shop/server exits 0 — confirmed
[x] PROJECT.md updated with Phase 13 status
[x] PROGRESS.md updated with session entry
```

---

## 8. Files created or modified

### Deviations from this document's own assumptions (read before reusing any pseudocode above)

- **No `packages/ui/src/patterns/index.ts` barrel exists in the real
  codebase** — every existing pattern (`EmptyState`, `PageHeader`, etc.)
  exports straight from `packages/ui/src/index.ts`. Followed that
  precedent instead of creating a barrel nothing else uses.
- **`ShopIdentityContext`/`useShopIdentity` live in `packages/ui`, not
  `apps/client`** — `DocumentHeader`/`DocumentFooter` need the hook and
  `packages/ui` may never import from `apps/client` (one-way dependency
  direction). `apps/client/src/context/ShopIdentityContext.tsx` is a
  thin provider that fetches via IPC and feeds `@shop/ui`'s context.
- **`ItemLookups` has no `priceLevels` field** and no channel exposed
  `price_level` rows at all. Added (owner-approved mid-session):
  `listPriceLevels()` in `lookup.repository.ts` (plain reference read,
  same pattern as `listBusinessUnits`/`listUoms`), `PriceLevelDto`/
  `PriceLevelsDto` contracts, `party:listPriceLevels` channel registered
  in `customer.handler.ts`, one repository test.
- **`customer-ledger.repository.ts` is a new file**, not a
  `KyselyPartyRepository` method — `party.repository.ts` was already
  568 lines.
- **CL-0a's Settings-page fields need a setter, not just a getter** —
  the spec listed only 3 read tests, but "Add fields for Phone,
  Address..." implies they're saveable. Added `setShopIdentity` + 2
  tests (see §7).
- **`RecordPaymentModal` had no "success state"** for CL-7F's Print
  receipt button to attach to — it closed immediately on success. Added
  a genuine success state (doc number + Print receipt + Done), and
  changed the caller (`CustomerDetailPage`) to stop auto-closing on
  `onPaid`.
- **`SaleInvoiceModal`'s totals block omits the discount line** the
  spec describes — `InvoiceData`/`getSaleInvoiceData` never carried a
  discount field through from `sale.discount_amount`, and threading it
  through would touch the shared print-layout types. Documented gap,
  not built — proportionality call.
- **`AddCustomerModal` has no "City / area" field** — `CreateCustomerInput`
  has no such field (only `address` on `party`, with no write path yet,
  same pre-existing gap `invoice.repository.test.ts` already notes).
  Omitted rather than show a field that silently does nothing.
- **`TableRow` (packages/ui) gained an optional `onClick` prop** — no
  existing table row was clickable before this phase; needed for the
  customer list and ledger table to drill into detail views.

### New files

- `packages/core/src/shop/shop-identity.ts`
- `packages/db/src/repositories/shop-identity.repository.ts`
- `packages/db/src/repositories/shop-identity.repository.test.ts`
- `packages/db/src/repositories/customer-ledger.repository.ts`
- `packages/db/src/repositories/customer-ledger.repository.test.ts`
- `packages/db/src/repositories/customer-statement.repository.test.ts`
- `packages/core/src/printing/payment-receipt-layout.ts`
- `packages/core/src/printing/payment-receipt-layout.test.ts`
- `packages/core/src/printing/customer-statement-layout.ts`
- `packages/ui/src/patterns/DocumentHeader.tsx`
- `packages/ui/src/patterns/DocumentFooter.tsx`
- `packages/ui/src/patterns/DocumentSection.tsx`
- `packages/ui/src/patterns/ShopIdentityContext.ts`
- `apps/client/src/context/ShopIdentityContext.tsx`
- `apps/client/src/pages/parties/CustomerDetailPage.tsx`
- `apps/client/src/pages/parties/CustomerStatCards.tsx`
- `apps/client/src/pages/parties/CustomerLedgerTable.tsx`
- `apps/client/src/pages/parties/SaleInvoiceModal.tsx`
- `apps/client/src/pages/parties/PaymentReceiptModal.tsx`
- `apps/client/src/pages/parties/CustomerStatementModal.tsx`
- `apps/client/src/pages/parties/AddCustomerModal.tsx`
- `apps/client/src/pages/parties/ImportCustomerBalanceInstructions.tsx`
- `apps/client/src/pages/parties/useImportCustomerBalanceFlow.ts`
- `apps/server/src/printing/payment-receipt-pdf.ts`
- `apps/server/src/printing/payment-receipt-file.ts`
- `apps/server/src/printing/print-payment-receipt.ts`
- `apps/server/src/printing/print-payment-receipt-safely.ts`
- `apps/server/src/printing/customer-statement-pdf.ts`
- `apps/server/src/printing/customer-statement-file.ts`
- `apps/server/src/printing/print-customer-statement.ts`
- `apps/server/src/printing/print-customer-statement-safely.ts`
- `apps/server/src/ipc/handlers/customer-balance-import.handler.test.ts`

### Modified files

- `packages/core/src/index.ts`
- `packages/contracts/src/party/customer.ts`
- `packages/contracts/src/payment/payment.ts`
- `packages/contracts/src/sale/sale.ts`
- `packages/contracts/src/setting/setting.ts`
- `packages/contracts/src/index.ts`
- `packages/ui/src/index.ts`
- `packages/ui/src/primitives/Table.tsx`
- `packages/db/src/index.ts`
- `packages/db/src/repositories/receipt.repository.ts`
- `packages/db/src/repositories/receipt.repository.test.ts`
- `packages/db/src/repositories/invoice.repository.ts`
- `packages/db/src/repositories/invoice.repository.test.ts`
- `packages/db/src/repositories/lookup.repository.ts`
- `packages/db/src/repositories/lookup.repository.test.ts`
- `apps/server/src/ipc/channels.ts`
- `apps/server/src/ipc/handlers/customer.handler.ts`
- `apps/server/src/ipc/handlers/print.handler.ts`
- `apps/server/src/ipc/handlers/setting.handler.ts`
- `apps/server/src/ipc/handlers/payment.handler.ts`
- `apps/server/src/ipc/handlers/sale.handler.ts`
- `apps/server/src/ipc/handlers/customer-balance-import.handler.ts`
- `apps/server/src/preload.ts`
- `apps/client/src/types/electron-api.d.ts`
- `apps/client/src/app/App.tsx`
- `apps/client/src/pages/parties/CustomersPage.tsx`
- `apps/client/src/pages/parties/CustomerListView.tsx`
- `apps/client/src/pages/parties/RecordPaymentModal.tsx`
- `apps/client/src/pages/parties/ImportCustomersModal.tsx`
- `apps/client/src/pages/settings/ShopIdentityCard.tsx`
- `PROJECT.md`
- `docs/phases/PHASE_13.md`

**Note:** `apps/server/src/main.ts` did **not** need modification — every
new IPC handler was added to an existing, already-registered
`register*Handlers` function rather than a new one.

- `apps/client/src/App.tsx`
- `apps/client/src/pages/parties/CustomersPage.tsx`
- `apps/client/src/pages/parties/CustomerListView.tsx`
- `apps/client/src/pages/parties/RecordPaymentModal.tsx`
- `apps/client/src/pages/settings/SettingsPage.tsx`
- `apps/server/src/ipc/handlers/[customer balance import handler]`
- `apps/client/src/pages/parties/[ImportCustomersModal]`
- `PROJECT.md`
- `PROGRESS.md`

---

## 9. Post-completion polish series (renderer-only, no new IPC/schema/dependency)

A follow-on multi-turn session, same day, over the customer screens built
in CL-5–CL-9. UI-only throughout: no new IPC channel, no schema migration,
no new npm dependency. Each turn ran `npm run typecheck` and
`npm run build --workspace=@shop/client` (both exit 0 every time) — full
automated test suite (`npm run verify`) was not re-run since no
`packages/core`/`packages/db` file changed.

**Changes:**

- `AddCustomerModal.tsx` — phone field constrained to digits-only,
  11-digit `maxLength`, `inputMode="numeric"`; submit-time length
  validation reusing the file's existing single-`Alert` error pattern
  (no per-field error state existed to reuse). Save/Cancel buttons
  rebuilt to match `RecordPaymentModal.tsx`'s pattern (`Check` icon,
  `size="large"` primary Save; raw `text-danger` Cancel button — the
  shared `Button` primitive has no `ghost`/`className` option).
- `RecordPaymentModal.tsx` — payment-method buttons gained icons
  (`Banknote`/`Building2`/`Smartphone`/`FileText`); Save/Cancel rebuilt
  same as above; modal widened to `size="wide"` (`Modal` only exposes
  `default`/`wide` — no `className`/`maxWidth` prop exists, so the
  requested `max-w-2xl` was not achievable without editing the shared
  component); body restructured several times across the session,
  settling on: full-width customer-context block → full-width
  `border-t` divider → `grid grid-cols-2 gap-6 mt-4` (left: payment
  method toggle only, buttons `flex flex-wrap gap-2`; right:
  `space-y-4` — Amount received + Pay-full-balance link, Payment date,
  Reference No., Notes) → full-width Cancel/Save footer. The payment
  method toggle group was extracted to `PaymentMethodToggle.tsx` when
  the file briefly exceeded 300 lines (302) mid-session.
- `BalanceSparkline.tsx` — the inline-SVG trend chart was replaced with
  a `BalanceSummary` component (30-day credit-given/received totals);
  filename kept, export renamed.
- `CustomerStatCards.tsx` — swapped `BalanceSparkline` for
  `BalanceSummary`; later in the session its outer `<Card>` wrapper was
  replaced with a plain `<div>` carrying the same
  `rounded-2xl bg-surface shadow-[0_1px_3px_rgba(0,0,0,.06),0_4px_16px_rgba(0,0,0,.06)]`
  treatment used by the Customers-list/ledger-table cards (`Card` has
  no `className` override).
- `CustomerDetailPage.tsx` — went through several redesigns of the
  customer-info card: added (Business name/Phone/Address/Price
  level/Credit limit/Notes, gated behind a "≥2 non-null optional
  fields" visibility check to avoid an empty-looking card), then
  **removed entirely** per a later instruction — phone, address, price
  level, and notes now render as a small muted-text row directly under
  the page-header name/code-chip instead. The header block itself
  gained the shared shadow-card treatment. Card-to-card spacing was
  tightened twice (`gap-6`→`gap-3`→`gap-2`, header's own `mb-4`→`mb-2`).
  `CustomerLedgerTable` now receives a new `customerCode` prop (for the
  CSV export filename).
- `CustomersPage.tsx` / `CustomerListView.tsx` — list wrapped in the
  same shadow-card `<div>` as the Suppliers screen; table header cells,
  row `zebra`/`hover` props, and the code-chip badge span copied
  verbatim from `SupplierListView.tsx`. **Balance-tone colour logic was
  deliberately NOT copied from `SupplierListView`** — Suppliers'
  positive-balance-is-green mapping is correct for a payable ledger,
  but would invert the meaning of a customer's outstanding-udhaar
  balance (positive = owed to the shop, shown amber/`due` everywhere
  else in this phase's own screens). Flagged to the owner in-session;
  left as-is pending an explicit decision to override.
- `CustomerLedgerTable.tsx` — same shadow-card wrapper, header, and
  row-style treatment as above; new client-side CSV export feature
  (see below); `DESCRIPTIONS` map extracted to
  `ledger-entry-descriptions.ts` to avoid a circular import with the
  new export menu.
- **New: `LedgerExportMenu.tsx`** — "Export CSV" button + a simple
  state-toggle dropdown (no dropdown/popover primitive exists anywhere
  in `apps/client/src/components/` or `packages/ui/src/` — confirmed by
  grep before building this) with four options: all entries, this
  month, last month, and an inline custom From/To date range. Closes on
  outside click via a `mousedown` document listener. Builds a CSV
  client-side from the already-fetched `rows` prop (no new IPC), with
  money columns as plain `(paisa / 100).toFixed(2)` rupee values (no
  "Rs" prefix, so spreadsheet software can sum them — the one place in
  this codebase where dividing paisa by 100 outside `MoneyDisplay` is
  correct, since it targets a file for external software, not the UI),
  and triggers a download via a `Blob`/`URL.createObjectURL`/anchor-click,
  matching the brief's exact `downloadCsv` implementation.
- **New: `ledger-entry-descriptions.ts`** — the `DESCRIPTIONS` map
  shared between `CustomerLedgerTable.tsx` and `LedgerExportMenu.tsx`.
- **New: `PaymentMethodToggle.tsx`** — the payment-method button-toggle
  group, extracted from `RecordPaymentModal.tsx` (see above).

**Verification (every turn, all exit 0):**

```
npm run typecheck
npm run build --workspace=@shop/client
```

Final line counts: `RecordPaymentModal.tsx` 268, `CustomerLedgerTable.tsx`
209, `CustomerDetailPage.tsx` 192, `CustomerStatCards.tsx` 75,
`CustomerListView.tsx` 166, `CustomersPage.tsx` 94, `AddCustomerModal.tsx`
211, `PaymentMethodToggle.tsx` 55, `LedgerExportMenu.tsx` 194,
`ledger-entry-descriptions.ts` 7. All ≤ 300.

**Visual confirmation:** Completed on the shop machine 2026-09-20 — the
owner confirmed the CSV export downloads a real file that opens correctly,
the payment modal is wider and two-column, and the customer-screen cards
read as one grouped section rather than floating boxes. See §7's updated
checkboxes.

**Watch list (not a blocker — see PROJECT.md §4 DEBT-5):**

- `RecordPaymentModal.tsx` sits at 268 lines after one extraction
  (`PaymentMethodToggle.tsx`) already this session, following several
  rounds of layout changes. **The next session that touches this file
  should check its line count before adding anything** and extract
  another subcomponent (e.g. the customer-context block, or the
  amount-input group) proactively rather than waiting to hit 300.
- `LedgerExportMenu.tsx` (194 lines) is new and single-purpose today;
  watch it if more export options are added later.

**Tests added at close-out (2026-09-20), covering gaps found while
auditing this polish series against existing repository test coverage:**

- `party.repository.test.ts` — three new tests: an 11-digit phone saves
  and is returned by `searchCustomers`; a 10-digit phone also saves,
  confirming the 11-digit rule from `AddCustomerModal.tsx` is UI-only and
  not enforced at the repository level; `address` round-trips through
  `createCustomer` → `getCustomerById`, both with a real value and with
  `null`.
- `customer-ledger.repository.test.ts` — one new test: a ledger with one
  sale row and one payment row returns both from `getCustomerLedger`,
  and `sourceType` correctly separates them into one of each — the data
  shape `CustomerLedgerTable.tsx`'s All/Sales/Payments filter chips
  depend on.
- **Not duplicated** — already-existing, equivalent coverage found
  before writing anything new: `customer-statement.repository.test.ts`
  already tests `getCustomerStatementData`'s opening-balance and
  closing-balance arithmetic with hand-calculated comments (near-identical
  fixture to what this session's brief asked for); the customer-balance
  import handler's "mismatched name is rejected, not silently skipped"
  behavior is already covered at both the core layer
  (`customer-balance-import.test.ts`, asserting the exact reason string)
  and the handler layer (`customer-balance-import.handler.test.ts`) — both
  re-confirmed passing in this session's `npm run verify` run.
- Final count: 602/602 (598 baseline + 4 new tests), `npm run verify`
  exit 0.
