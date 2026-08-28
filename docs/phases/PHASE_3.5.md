# Phase 3.5 — Document numbering + multi-unit selling

**Status:** ALL SUB-PHASES BUILT AND VERIFIED — pending final commit hash
**Started:** 2026-08-28
**Completed:** 2026-08-28
**Branch:** main
**Last commit:** — (fill in after commit; see PROGRESS.md)

---

## 1. Goal

Every document number the shop or a customer sees is a clean
`PREFIX-NNNN` — no device-code segment, no 6-digit padding
artifact — and continues counting up from wherever the shop's own
paper pad left off. Alongside that, a salesman can sell an item in a
unit different from the one it's stocked in (copper pipe by the
foot when it's stocked in kg, oil by the liter when it's stocked in
ml) and the system converts to the correct stock-unit deduction
automatically, without the salesman doing the arithmetic. Both land
before any item import or Phase 4 work begins, since the import
template gains two new optional columns this phase and Phase 4's
receipt/invoice printing will render whichever doc-number format is
decided here.

---

## 2. Scope

### In scope

- **P3.5-1 — Document numbering.** Migration reformatting existing
  `doc_no` values on `sale`, `customer` (`party`), `supplier`
  (`party`), `purchase`, `payment` from `PREFIX-DEVICECODE-NNNNNN`
  to `PREFIX-NNNN`; renaming `payment`'s `doc_type`/prefix to
  `payment_in`/`RCP` and adding an unused `payment_out`/`PMT` seed
  row; a shared `formatDocNumber`-replacement used by every
  repository that mints a doc number; a `formatDocNo` display
  helper.
- **P3.5-2 — UoM conversion table.** `uom_conversion` table, four
  fixed conversions seeded at bootstrap, a read-only
  `uom_conversion:list` IPC channel.
- **P3.5-3 — Item alt unit.** `item.alt_uom_id` /
  `alt_uom_factor_milli` columns; item create/edit (contracts +
  repository + client form) gains an optional alt-unit pair; item
  import CSV gains optional `Alt Unit` / `Alt Factor` columns.
- **P3.5-4 — Sale line alt unit.** `sale_line.sale_uom_id` /
  `sale_to_stock_factor` columns; `CreateSaleInput`/`SaleLineInput`
  gain the same optional pair (Zod-enforced together); `createSale`
  converts to stock-unit quantity when a sale UoM is given; the sale
  screen gains a per-line unit toggle when the item has an alt unit.

### Explicitly out of scope

- UoM conversion management UI (add/edit/delete conversions) — Phase 4
- Wholesale price level data entry UI — Phase 4
- Receipt printing — Phase 4
- Any report — Phase 4
- `payment_out` business logic (the PMT doc type is seeded as a seam
  only; no repository/IPC/UI path posts a supplier payment this
  phase) — Phase 4/8, per the existing note in `PHASE_3.md` §8
- P2-1/P2-2 IPC + UI (supplier CRUD, purchase entry reachability) —
  immediately after Phase 3.5, before Phase 4 feature work, per
  `PROJECT.md`'s standing recommendation

---

## 3. Tasks

| ID       | Task                                                                                 | Status                                   | Commit |
| -------- | ------------------------------------------------------------------------------------ | ---------------------------------------- | ------ |
| P3.5A    | formatDisplayDocNumber (packages/shared)                                             | DONE — verified 2026-08-28               | —      |
| P3.5B    | Migration 0006 (document numbering reformat)                                         | DONE — verified 2026-08-28               | —      |
| P3.5C    | Repositories switch to new doc-number format; payment renamed to payment_in/RCP      | DONE — verified 2026-08-28               | —      |
| P3.5D    | Migration 0007 (uom_conversion table)                                                | DONE — verified 2026-08-28               | —      |
| P3.5E    | bootstrap.ts seeds 4 fixed uom_conversion rows                                       | DONE — verified 2026-08-28               | —      |
| P3.5F    | uom:listConversions IPC channel (read-only)                                          | DONE — verified 2026-08-28 (code review) | —      |
| P3.5G    | Migration 0008 (item alt uom) + createItem + import CSV alt columns                  | DONE — verified 2026-08-28               | —      |
| P3.5G-UI | Item form alt-unit fields (ItemsPage.tsx)                                            | DONE — verified 2026-08-28 (build only)  | —      |
| P3.5H    | Migration 0009 (sale_line alt uom) + createSale conversion + sale screen unit toggle | DONE — verified 2026-08-28               | —      |
| P3.5-1   | Document numbering migration + display format (= A+B+C)                              | DONE                                     | —      |
| P3.5-2   | UoM conversion table + seed + read-only IPC (= D+E+F)                                | DONE                                     | —      |
| P3.5-3   | Item alt unit (schema + contracts + repo + UI + import) (= G+G-UI)                   | DONE                                     | —      |
| P3.5-4   | Sale line alt unit + createSale conversion + sale UI (= H)                           | DONE                                     | —      |

---

## 4. Exit criteria

- [x] `npm run verify` exits 0, all tests green (≥160 + new) — 186/186,
      real output pasted at every sub-phase checkpoint
- [x] `document_sequence` queried directly — all rows show the new
      `doc_type`/prefix values (`payment_in`/RCP present,
      `payment_out`/PMT seeded with no rows) — P3.5B checkpoint
- [x] A new sale created after the migration has `doc_no` in
      `INV-NNNN` format (no device-code segment) — queried directly —
      P3.5C checkpoint (`INV-0001`)
- [x] `uom_conversion` seeded rows queried directly — all 4 fixed
      conversions present — P3.5D/E checkpoint
- [x] Item with `alt_uom` created — `alt_uom_id` and
      `alt_uom_factor_milli` queried directly — P3.5G checkpoint
- [x] Sale with alt unit — `stock_movement.quantity` matches a
      hand-calculated converted value — queried directly — P3.5H
      checkpoint (10 feet → -3050 milli-kg, hand calc matched exactly)
- [x] `npm run build` exits 0 for both apps — confirmed at P3.5G-UI
      and again at P3.5H
- [x] All existing 160 tests still pass (no regression) — 186 total,
      all pre-existing tests green throughout (with hardcoded-list/
      count assertions mechanically updated as each migration/column
      was added — see §5)

---

## 5. Design decisions made this phase

| Decision                                                                                                                                                                                                                                                                    | Reasoning                                                                                                                                                                                                                                                            | ADR? |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| ADR-0012's "old prefix" table corrected against live code: `sale` already uses `INV`, never `SAL` — no `SAL-`-prefixed row has ever existed                                                                                                                                 | Golden Rule 6 (live code is the truth); the phase-kickoff draft's premise was wrong, caught by reading `sale.repository.ts`/`id.ts` before writing the ADR, not after building a migration on a false assumption                                                     | 0012 |
| The actual `doc_no` migration is a display-format change (drop device code, pad to 4 not 6) for four of the five doc types, and a `doc_type`/prefix rename only for `payment`                                                                                               | Same reading — see ADR-0012's correction note                                                                                                                                                                                                                        | 0012 |
| ADR-0013's own worked examples (Migration B, CSV section) were self-contradicting against their own field definition — corrected to the direction that makes `createSale`'s formula produce a sane result and matches `item.purchase_to_stock_factor`'s existing convention | Caught while working out P3.5H's hand-calculated test values, before any migration was written                                                                                                                                                                       | 0013 |
| H1: seed 6 new UoM rows (`Gram`, `Liter`, `Milliliter`, `Inch`, `Meter`, `Centimeter`), reuse existing `Kg`/`Foot` as-is, do not rename `Kg`                                                                                                                                | Owner decision, smaller/non-renaming change; nothing displayed today says "Kilogram" that would need to match                                                                                                                                                        | No   |
| H2: `updateItem` is out of scope for P3.5 — `createItem` only, item edit deferred to Phase 8                                                                                                                                                                                | Owner decision; no `updateItem` implementation exists anywhere in the codebase before or after this phase                                                                                                                                                            | No   |
| `listUomConversions` lives in `packages/db/src/repositories/lookup.repository.ts` (a plain exported function), not as a method on `KyselyItemRepository`/`ItemRepositoryPort`                                                                                               | That file's own doc comment: "Plain reference-data reads — no business logic, so these skip the core port/service pattern used for item writes" — `uom_conversion` is the same class of read as `listUoms`/`listBusinessUnits`/`listCategories`, already there       | No   |
| Sale screen resolves the alt unit's display name client-side (via `ipc.item.lookups()`, mirroring `ItemsPage.tsx`'s existing `uomName()` pattern), not via a server-side `altUomName` field on `ItemDto`                                                                    | Keeps `ItemDto`'s shape and the server query narrower; matches an existing precedent in the same app rather than inventing a new one                                                                                                                                 | No   |
| Kysely-schema nullable columns (`altUomId`, `altUomFactorMilli`, `saleUomId`, `saleToStockFactor`) typed as plain `T \| null`, not `Generated<T \| null>`                                                                                                                   | No other nullable column in `ItemTable`/`SaleLineTable` uses `Generated<>`; matching the file's own established pattern, not the literal syntax first suggested                                                                                                      | No   |
| `CreateItemInput`/`SaleLineInput` factored so `.refine()` doesn't break `.partial()` downstream (`UpdateItemInput`)                                                                                                                                                         | `ZodEffects` (the result of `.refine()`) has no `.partial()` method — the plain object shape is kept as a separate const and both the refined and the `.partial()`'d types are built from it                                                                         | No   |
| Core port interfaces' new optional fields (`altUomId?`, `altUomFactorMilli?`, `saleUomId?`, `saleToStockFactor?`) declared as `T \| undefined`, not bare `T`                                                                                                                | `exactOptionalPropertyTypes: true` in this repo's tsconfig treats `key?: T` and `key?: T \| undefined` as different types; Zod's `.optional()` infers the latter, so the port types must match it exactly for the handler's direct `input` pass-through to typecheck | No   |

---

## 6. Bugs found this phase

- **`item.service.ts`'s `createItem()` silently dropped `altUomId`/
  `altUomFactorMilli`** — found while fixing an unrelated
  `exactOptionalPropertyTypes` typecheck error in P3.5H, not by a
  dedicated test. The real IPC path (`item:create` →
  `createItem(repo, input)`) explicitly remaps each field one by one
  and never included the two new ones, so the P3.5G-UI item form's
  alt-unit inputs would have been silently discarded before reaching
  the database — even though `KyselyItemRepository.createItem()`
  itself (tested directly in `item.repository.test.ts`, bypassing the
  service wrapper) was correct all along. Fixed same session — not
  logged as a numbered `PROJECT.md` bug since it was caught and
  closed before any commit shipped it, per the same precedent Phase 3
  used for the `electron-api.d.ts` drift.

---

## 7. Open questions resolved this phase

- H1 (UoM seed naming), H2 (`updateItem` scope), H3 (`payment_out`
  seam) — all resolved by the owner at plan-approval time, before any
  sub-phase began. See §5 above and the plan-approval turn.

---

## 8. Notes for the next phase

- **`updateItem` still does not exist anywhere in this codebase.**
  Item alt-unit (and every other item field) can only be set at
  creation or via CSV re-import. Per H2, build `updateItem` in
  Phase 8, not before.
- **`payment_out`/`PMT` is a seeded seam only** — `document_sequence`
  has the row (H3), but no repository/IPC/UI path ever posts a
  supplier payment. Phase 4/8, per `PROJECT.md`'s standing note.
- **`item.handler.ts`'s three pre-existing handlers
  (`item:create`/`item:search`/`item:lookups`) still don't use
  `withError`** — noted at the P3.5F checkpoint, not fixed (out of
  that sub-phase's scope). `uom:listConversions`, added this phase,
  does use it. Worth a small follow-up pass before Phase 4.
- **UoM conversion management UI** (add/edit/delete conversions) is
  still unbuilt — `uom_conversion` is seeded and readable
  (`uom:listConversions`) but not owner-editable from the running
  app. Phase 4, per this phase's stated scope.
- P2-1/P2-2 IPC + UI (supplier CRUD, purchase entry reachability) is
  still the oldest open gap in the project — flagged again every
  phase since Phase 2 closed. Recommended as the very next work,
  before any Phase 4 feature work.
