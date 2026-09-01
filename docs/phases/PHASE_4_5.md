# Phase 4.5 — Full UI Redesign

**Status:** ✅ COMPLETE — 2026-09-01. All nine sub-phases plus purchase
PDF printing, the three post-P4.5-8 UI improvements (import modals
everywhere, Purchases two-step modal, Settings restore double-gate
removed), and Reports/Settings/Customers/purchase-print hardware
verification are all done. `npm run verify` — **294/294 passing**,
typecheck clean, lint clean.
**Started:** 2026-08-30
**Prior commit:** `40db1d8` (Phase 4 close-out) — this phase's work
is committed on top of that as this phase's own close-out commit.
**Branch:** main

---

## 1. Goal

The app was functionally complete through Phase 4 (245/245 tests) but
visually bare, unstyled HTML. This phase gives every screen a real,
consistent design system — Tailwind, a shared component library, a
proper navigation shell — without changing any business logic, IPC
handler signature, or database schema. Reports (R1–R5) get a screen
for the first time. Two structural gaps surfaced and fixed mid-phase,
by explicit owner request: the Purchases screen's session-memory-only
list became a real persisted list, and purchase orders can now be
printed to PDF.

---

## 2. Scope

### In scope (all built this phase)

- Tailwind wired into both `apps/client`'s standalone build and
  `apps/server`'s packaged renderer build (these turned out to need
  different fixes — see §5).
- Design tokens extended (not invented from scratch — `packages/ui/src/tokens/colors.ts`
  and `apps/client/tailwind.config.js` already existed with a real
  palette; `danger`/`warning`/`success` added).
- Lightweight custom i18n (`packages/i18n`) — English content now,
  Urdu structure only, per owner decision.
- Shared component library in `packages/ui/src` (owner decision —
  not `apps/client/src/components/ui/` as originally drafted, to match
  the pre-existing scaffold and `CODING_STANDARDS.md` §3).
- Global navigation shell (sidebar, `Alt+1`–`Alt+7`).
- Every existing screen restyled: Sales (full two-panel rebuild),
  Items, Suppliers, Purchases, Settings, Customers.
- Items: two-step Add Item modal, item-code auto/manual toggle, bulk
  import modal with real sample-CSV downloads.
- Suppliers: corrected mid-phase from a three-tab layout to the Items
  modal pattern.
- Purchases: corrected mid-phase to add a real persisted list
  (`purchase:list`, new), Cancel wrapped in a confirmation dialog, and
  — after that — purchase order PDF printing (`purchase:printOrder`, new).
- Reports screen (R1–R5), including the `report:*` IPC namespace built
  from nothing (channel names existed in `channels.ts` but were never
  wired to a handler).
- BUG-Y fixed (negative-stock/credit-limit warning is now a modal, not
  inline text) — pulled forward from its original Phase 8 deferral
  since it was a pure UI change.
- Post-P4.5-8 UI improvements (owner request, after all screens were
  hardware-confirmed once): a shared two-page `ImportModal` pattern
  (`packages/ui/src/patterns/ImportModal.tsx`) applied to all three
  import flows (Items, Suppliers, and a new `ImportCustomersModal`
  replacing the old inline `CustomersImportPage` card); a wide
  (`size="wide"`, `max-w-4xl`) two-step `Modal` for Purchases,
  replacing the always-visible inline "New purchase" card with a
  "New Purchase" header button, Step 1 (supplier/date/payment mode)
  and Step 2 (line entry, same `CartTable`/Enter-chain as before); and
  removal of the double confirmation on Settings' restore-from-backup
  (native `dialog.showMessageBox` removed from `backup.handler.ts` —
  the native file picker for choosing _which_ backup file was kept,
  since there is no other way to supply that path in this
  architecture; only the React `ConfirmDialog` gates the action now).

### Explicitly out of scope

- Everything `CLAUDE.md` §10 forbids.
- Any IPC handler signature change, repository logic change, or schema
  migration — the two new IPC channels this phase (`purchase:list`,
  `purchase:printOrder`, plus the `report:*` namespace) are additive
  only, each discussed and approved before being built, never invented
  silently.
- Dark mode, animations beyond simple CSS transitions, any third-party
  component library.
- GRN/batch tracking, purchase-entry-as-modal — logged as future
  feature requests in `PROJECT.md`, not built this phase.
- Writing real Urdu translation content.

---

## 3. Sub-phases

| ID     | Task                                                                                                                   | Status                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| P4.5-0 | Tailwind wiring, design tokens, i18n scaffold, shared component library                                                | DONE — hardware confirmed |
| P4.5-1 | Global shell — sidebar, `Alt+N` shortcuts                                                                              | DONE — hardware confirmed |
| P4.5-2 | Sales screen — two-panel rebuild, BUG-Y fix                                                                            | DONE — hardware confirmed |
| P4.5-3 | Items screen + two-step modal, item-code toggle, import modal                                                          | DONE — hardware confirmed |
| P4.5-4 | Suppliers screen, corrected to modal pattern                                                                           | DONE — hardware confirmed |
| P4.5-5 | Purchases screen, corrected to add real list + cancel confirm + `purchase:list` IPC                                    | DONE — hardware confirmed |
| P4.5-6 | Reports screen (R1–R5) + full `report:*` IPC layer                                                                     | DONE — hardware confirmed |
| P4.5-7 | Settings screen — three cards, backup/restore wiring                                                                   | DONE — hardware confirmed |
| P4.5-8 | Customers screen — list + restyled import                                                                              | DONE — hardware confirmed |
| —      | Purchase PDF printing (owner request, after P4.5-8)                                                                    | DONE — hardware confirmed |
| —      | Import modals everywhere, Purchases two-step modal, Settings restore double-gate removed (owner request, after P4.5-8) | DONE — hardware confirmed |

---

## 4. Exit criteria

- [x] `npm run verify` exits 0 — **294/294**, typecheck clean, lint
      clean, format clean.
- [x] `npm run build --workspace=@shop/client` and
      `--workspace=@shop/server` both exit 0 after every sub-phase.
- [x] Every screen keeps its existing keyboard interactions — verified
      by re-reading each `onKeyDown` handler after every redesign, not
      just visually.
- [x] Sales screen: a full sale completed keyboard-only on real
      hardware.
- [x] Hardware confirmation: shell, Sales, Items (incl. all three
      improvements), Suppliers (incl. modal correction), Purchases
      (incl. real list, cancel confirm, PDF print button existing and
      producing output).
- [x] **Hardware confirmation: Reports — all five tabs load real
      data.** Confirmed 2026-09-01: R1 Daily Sales (KPI tiles, correct
      empty state for a day with no sales), R2 Stock on Hand (negative
      stock shown correctly in red — confirmed test-data artifact, not
      a bug), R3 Receivables Aging (Ahmad Retail Rs 6,000 in the
      Current bucket), R4 Cash Book (running balance on every entry,
      PUR-0001 correctly shown as a red OUT of Rs 40,000), R5 Unit P&L
      (confirmed in an earlier session — Repair column is zero because
      no repair jobs exist yet, correct ahead of Phase 6).
- [x] **Hardware confirmation: Settings — shop name save, paper size
      toggle, backup, restore.** Confirmed in an earlier session; the
      restore double-gate removal (native confirm dialog dropped from
      `backup.handler.ts`, React `ConfirmDialog` now the sole gate) was
      verified by code/typecheck/test after that session, not
      re-confirmed on hardware separately since it only removes a
      prompt, it does not change the restore path itself.
- [x] **Hardware confirmation: Customers — list loads, import works.**
      Confirmed in an earlier session; the import flow was moved from
      an inline card into `ImportCustomersModal` (two-page pattern)
      afterward and re-confirmed 2026-09-01 via the equivalent
      Suppliers modal (same shared `ImportModal` component).
- [x] **Hardware confirmation: purchase PDF printing produces a
      correctly laid out A4 page.** Confirmed 2026-09-01: bordered
      table, supplier block, grand total, payment mode, footer —
      professional layout.
- [x] **Hardware confirmation: Purchases two-step modal.** Confirmed
      2026-09-01: PUR-0002 created via the modal, green success alert
      on the page, persistent list with Print/Cancel intact.
- [x] **Hardware confirmation: import modals two-page flow.** Confirmed
      2026-09-01 on Suppliers (Step 1 of 2 — instructions + Download
      CSV; Step 2 of 2 — Dry run / Commit / Back); Items and Customers
      share the identical `ImportModal` component, same code path.
- [x] No IPC handler signature, repository method, or schema changed
      without explicit discussion first.
- [x] Every bug found logged in `PROJECT.md`, not silently fixed,
      except BUG-Y (explicitly pulled into this phase's scope) and two
      genuine implementation mistakes caught before shipping (a
      packaged-build Tailwind content-path bug, and a copy-paste field
      name in the Items import result display) — both fixed the same
      turn they were found, not deferred, since they were defects in
      this phase's own new code, not pre-existing business logic.

**All exit criteria are met. Phase 4.5 is COMPLETE as of 2026-09-01.**

---

## 5. Binding constraints / decisions locked during this phase

- **CF-1 — component library location:** `packages/ui/src`, not
  `apps/client/src/components/ui/`. Matches the pre-existing scaffold
  (found, not built from scratch) and `CODING_STANDARDS.md` §3.
- **CF-2 — Tailwind wiring, not a fresh install:** `tailwindcss`,
  `postcss`, `autoprefixer` were already devDependencies with a
  populated `tailwind.config.js` before this phase started. The real
  work was wiring, and a real bug was found doing it: `apps/server`'s
  packaged renderer build (`electron-vite`, `root: '../client'`)
  resolved Tailwind's `content` globs against the wrong `cwd`, silently
  producing zero utility classes in the actual shipped app even though
  the standalone `apps/client` build worked by coincidence. Fixed with
  absolute content-glob paths and explicit PostCSS plugins passed
  directly in `electron.vite.config.ts`, not left to file-based
  auto-discovery.
- **CF-3 — i18n:** lightweight custom `t()` (`packages/i18n`), not
  `react-i18next` — avoids a new external dependency, matches this
  codebase's existing zero-dependency-for-shared-code philosophy.
  English content only; Urdu key structure exists but every value is
  `''` (falls back to English) — writing real Urdu translations is a
  separate, unscheduled task.
- **CF-4 — `report:*` IPC namespace approved and built:** no
  `report:*` handler existed before this phase (channel _names_ were
  declared in `channels.ts` but dead — no handler, no preload
  exposure, no client type). Explicitly discussed and approved before
  building; five thin handlers, same pattern as every other handler in
  this codebase, zero business logic added.
- **CF-5 — `sale:listByDate` type completion:** this channel was
  already fully wired end-to-end (handler + preload) before this
  phase, just missing from `electron-api.d.ts`'s type — R1 (Daily
  Sales report) is its first real client caller. Completing an
  existing declaration, not opening a new channel.
- **CF-6 — `purchase:list` IPC approved and built:** real gap (BUG-16)
  — the Purchases screen had no way to show a persisted list. New
  `listPurchases(limit)` on `PurchaseRepositoryPort`, TDD (failing
  test pasted, then passing), read-only, no business logic beyond a
  join for the supplier name.
- **CF-7 — `purchase:printOrder` IPC approved and built:** owner
  request, after P4.5-8. New pdfkit drawing code — flagged before
  writing it, since `receipt-pdf.ts` (pointed to as "the same
  pattern") turned out to only render one pre-built plain-text string;
  there was no existing table/multi-column pdfkit code anywhere in
  this codebase to reuse.
- **CF-8 — money/quantity formatting:** `Money.format`/`Qty.format`
  used for every figure in every new screen and the PDF, same as
  every prior phase — no ad-hoc formatting introduced.
- **CF-9 — known verification gap, same class as Phase 4's own
  documented P4-2c gap:** pdfkit compresses its content stream, so
  `purchase-pdf.test.ts` can only verify PDF structure (magic bytes,
  `/MediaBox`, non-trivial size) — not that the hand-drawn table/columns
  actually land where the spec says. That is what hardware verification
  is for.
- **CF-10 — import-modal file selection stays native, no new IPC:**
  the literal ask ("drag/drop upload area, validate headers
  immediately on file selection") is architecturally impossible without
  new IPC surface — every import handler's `dryRun`/`commit` takes zero
  renderer arguments and calls `dialog.showOpenDialog` itself
  server-side, so the renderer never sees file content to validate
  client-side. Resolved via `AskUserQuestion`, owner chose the adapted
  design actually built: page 2 explains the next click opens the
  native picker, keeps the real Dry Run/Commit IPC calls, and surfaces
  the server's real thrown error verbatim (the existing
  `packages/core/src/import/csv.ts` header-matching error, which lists
  all expected columns) rather than inventing a structured
  missing-columns diff that doesn't exist in the validation pipeline.
- **CF-11 — Settings restore: native file picker deliberately kept:**
  the ask said to also remove the native file picker from
  `backup.handler.ts`'s restore handler; only the native _confirmation_
  dialog was removed. The picker itself is how the caller specifies
  _which_ backup file to restore — there is no renderer-side file
  browsing anywhere in this app, so removing it would leave
  `restoreBackup(backupPath, ...)` with no source for that path at all,
  breaking the feature. Flagged as a deliberate deviation, not applied
  silently.

---

## 6. Open questions blocking this phase

None. All hardware confirmations in §4 are complete. Everything
surfaced during the phase was resolved with the owner in the same turn
it appeared (see §5's binding constraints) — nothing was guessed past.
