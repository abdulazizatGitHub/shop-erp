# Coding Standards

Rules exist to prevent specific, known failure modes. Each one below states the
failure it prevents. If a rule ever seems pointless, read the reason again
before ignoring it.

---

## 1. TypeScript

| Rule                                                     | Prevents                                    |
| -------------------------------------------------------- | ------------------------------------------- |
| `strict: true`, no exceptions                            | Whole classes of null/undefined bugs        |
| **No `any`.** Use `unknown` + narrowing                  | Type safety silently disappearing           |
| No non-null assertion `!` except after an explicit check | Runtime crashes on missing data             |
| Named exports only (except React page components)        | Inconsistent import names, poor refactoring |
| No `enum` — use `as const` union types                   | Enum runtime weirdness, bundle bloat        |
| Explicit return types on exported functions              | Accidental API changes                      |

---

## 2. Naming

Money and quantity naming is **enforced by lint** because it is the highest-risk
area in the codebase.

```ts
totalPaisa; // money — INTEGER paisa
unitPricePaisa;
quantityMilli; // quantity — INTEGER milli-units
qtyMilli;
```

Anything named `price`, `amount`, `total`, or `cost` **without** a `Paisa`
suffix is presumed to be a bug.

Other conventions:

- Files: `kebab-case.ts`. React components: `PascalCase.tsx`.
- Booleans read as assertions: `isActive`, `hasSerial`, `canEdit`.
- DB columns: `snake_case`. TS properties: `camelCase`. Mapping happens in `packages/db` only.

---

## 3. Shared components — build once, reuse

**Before writing any UI element or helper, search first:**

```bash
grep -r "ComponentName" packages/ui/src
grep -r "functionName" packages/shared/src
```

- If something similar exists, **extend it** rather than copying.
- **Three near-duplicates means one abstraction was missed.** Refactor at the third.
- `packages/ui` components contain **no business logic** — presentation and
  interaction only. They receive data and emit events.

Components expected early (build in `packages/ui`, not inline):

`Button` · `TextField` · `NumberField` (paisa/milli aware) · `MoneyDisplay` ·
`QuantityDisplay` · `DatePicker` · `SearchableSelect` · `DataTable` ·
`ConfirmDialog` · `Toast` · `FormRow` · `PageHeader` · `EmptyState` ·
`LoadingState` · `ErrorBoundary`

**`MoneyDisplay` and `NumberField` are the only places money is formatted or
parsed.** No ad-hoc `/100` anywhere else.

---

## 4. File and function size

| Limit                       | Action if exceeded           |
| --------------------------- | ---------------------------- |
| File > 300 lines            | Split it                     |
| Function > 50 lines         | Extract helpers              |
| Function params > 4         | Take an options object       |
| Nesting > 3 levels          | Extract or use early returns |
| React component > 200 lines | Split into subcomponents     |

---

## 5. Validation

**All data crossing a boundary is validated with Zod.** Boundaries are:

- IPC handlers (renderer → main)
- File imports (Excel/CSV)
- Any config or environment value

```ts
const CreateSaleInput = z.object({
  customerId: z.string().uuid().nullable(),
  lines: z.array(SaleLineInput).min(1),
  paidPaisa: z.number().int().nonnegative(),
});

ipcMain.handle('sale:create', async (_e, raw) => {
  const input = CreateSaleInput.parse(raw); // throws on bad input
  return saleService.create(input);
});
```

Never trust the renderer. It is a browser context.

---

## 6. Error handling

- No silent `catch {}`. Ever.
- Domain errors are typed classes (`InsufficientStockError`, `CreditLimitExceededError`).
- Errors crossing IPC are serialised to `{ code, message, details }` — never raw stack traces to the UI.
- Every user-facing error says **what happened** and **what to do next**, in plain language.
- Unexpected errors are logged with full context to a rotating local log file.

---

## 7. Testing

| Layer                               | Requirement                                                  |
| ----------------------------------- | ------------------------------------------------------------ |
| `packages/shared` (Money, Qty, IDs) | 100% coverage. Non-negotiable.                               |
| `packages/core` (domain services)   | Every money/stock path tested against hand-calculated values |
| `packages/db` (repositories)        | Integration tests against a real temp SQLite file            |
| `apps/renderer`                     | Smoke tests for critical screens                             |

**Every money or stock test must assert against a number calculated by hand and
written in a comment.** A test that asserts the code equals itself proves nothing.

```ts
// 3 items @ Rs 1,250.50 = Rs 3,751.50 = 375150 paisa
expect(lineTotalPaisa).toBe(375150);
```

---

## 8. Comments

- Comment **why**, never **what**.
- Every non-obvious business rule gets a comment naming the rule and its source.
- `// TODO:` must include an owner and a phase: `// TODO(P6): handle warranty rework`.
- Delete commented-out code. Git has it.

---

## 9. Commits

Conventional Commits, enforced by commitlint:

```
feat(sale): add credit limit warning on udhaar sale
fix(stock): correct cylinder to kg conversion on purchase
docs(phases): add Phase 6 exit criteria
chore(deps): bump better-sqlite3
```

Types: `feat` `fix` `docs` `style` `refactor` `test` `chore` `perf` `build` `ci`

**One logical change per commit.** No "wip" or "misc fixes".

---

## 10. Internationalisation

- **No hard-coded user-facing strings.** All go through `t('key')` from day one.
- English and Urdu keys maintained together.
- Retrofitting i18n later is miserable; doing it from the start is nearly free.
