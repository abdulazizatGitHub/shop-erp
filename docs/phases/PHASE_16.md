# Phase 16 — Jobs Settings: Service Charges, Brands, Commission Claims

**Status:** IN PROGRESS (P16-1 + P16-1b + P16-2 + P16-3a + P16-3b + P16-3c done, 845/845 tests; P16-4 next)
**Started:** 2026-09-23 (P16-1)
**Branch:** main
**Baseline:** f9cc7b8 (H1-H3 + I1-I4 close, 649/649 tests)

---

## 1. Goal

The shop owner can manage service charges and appliance brands without a
developer touching the database, and commission is no longer automatic:
the owner reviews and approves (or rejects) a claim for every delivered
labour charge that has commission configured, deciding who gets paid and
how much. This phase **replaces** Phase 7's automatic per-technician
commission model entirely — it does not extend it.

---

## 2. Scope

### In scope

- **P16-1 — Service charge management.** Service Charges section: list
  all `service_charge` rows (active + inactive), create, edit, toggle
  active. Fields: name, retail charge (Rs in UI, paisa in DB), job type
  (optional), commission mode (none / fixed paisa / basis points) +
  value. Inactive charges are excluded from `lookup.repository.ts`'s
  `listServiceCharges` (already filters `isActive=1` — this is the
  delivery modal's dropdown source) but still visible in the new admin
  list. No delete. Dev-only seed (never runs against a
  packaged/production build). Originally reached via a "Job Settings"
  tile → separate tabbed page (see the superseded §2b design below) —
  that navigation is replaced by P16-1b; the Service Charges content
  itself (`ServiceChargesTab.tsx`/`ServiceChargeModal.tsx`) is unchanged.

- **P16-1b — Settings shell redesign (OD-16-11, added 2026-09-23).**
  Owner rejected the stacked-cards layout and the Job Settings
  tile → separate page → tabs structure. Replaces §2b's navigation
  design — see the new §2b below for the full shell (grouped left
  sub-nav + routed right content pane, one `/settings/*` route per
  section, explicit per-section Save, unsaved-changes guard on sub-nav
  clicks). Presentation-only: no IPC/contract/migration change: every
  section's storage calls are the exact ones that existed before this
  task (Shop/Invoices & Receipts still call `setShopIdentity`/
  `setReceiptPaperSize`; Discounts and Backup & Restore are unchanged),
  confirmed by re-reading each existing card's save logic before
  relocating it, per this task's own "STOP and report if a move needs a
  storage change" rule — no stop was needed.

- **P16-2 — Brand management.** Brands section in the Settings shell.
  List all non-deleted brands, create, toggle active/inactive. `brand`
  is a single table shared with `item.brandId` (confirmed in use by the
  CSV item importer, `import.repository.ts` — see §2c). New migration
  `0017`: `ALTER TABLE brand ADD COLUMN is_active INTEGER NOT NULL
DEFAULT 1` (same convention as `service_charge.is_active`). `is_active`
  controls **only** the job-intake brand dropdown; CSV/item brand
  matching ignores it entirely and keeps using `deleted_at` exactly as
  today, untouched by this phase. Replaces the hardcoded `BRAND_OPTIONS`
  constant in `JobApplianceFields.tsx` (and `JobApplianceEditSection.tsx`,
  which re-exports it) with a live `brand:list` call (active brands
  only, for the dropdown). "Other" free-text stays and is never
  auto-added to `brand`. Production bootstrap: idempotent, per-tenant —
  for each starter name, insert only if no brand row with that name
  exists for the tenant, case-insensitive, **including deleted rows**
  (not "only if the tenant has zero brand rows" — safe to re-run every
  startup without ever double-inserting a name).

- **P16-3 — Commission claims and approvals.** Replaces Phase 7's
  automatic commission entirely. See §2a (owner decisions) for the full
  model. Delivered in three commits:
  - **P16-3a** — migrations (`commission_claim`, `commission_decision`
    with `attempt_no`, `commission_decision_recipient`,
    `commission_decision_reversal`), pure claim-calculation function in
    `packages/core`, delivery-transaction claim inserts, approve/reject
    core logic + repository, the GAP-1 decision-reversal path
    (OD-16-3a), retirement of the `party.commission_bp` read path,
    rewritten Phase 7 tests, ADR-0015.
  - **P16-3b** — Commission Approvals section (Settings shell, including
    the "Reverse" action), wage report change (approval-date
    attribution, pending-total in the report header). **A structural
    change to `wage-report.repository.ts` is required here, not just a
    filter check (FIX-1, found 2026-09-22):** the `commissionPaisa`
    column and `netPaisa`'s commission term both wrap the correlated
    subquery in `ABS(...)`, correct under Phase 7 (every commission
    row was negative) but wrong once reversals exist — a
    reversal-only month would show as commission _earned_ instead of
    _clawed back_. Both must change from `COALESCE(ABS((...)), 0)` to
    `-COALESCE((...), 0)` (drop `ABS`, negate instead).
  - **P16-3c** — technician removal guard: `unassign_reason` (migration
    `0020`, renumbered from an earlier implied `0019` — `0019` was taken
    by Checkpoint 1b's `commission_claim`/`commission_decision_recipient`
    snapshot columns). New core `technician-assignment.ts`
    (`assertTechnicianListUnlocked`, `assertUnassignReasonProvided`) and
    a new `unassignTechnician` core service function, replacing the
    handler's former direct repository call. The status lock covers
    **both** assign and unassign (widened during implementation, not
    unassign-only as this section originally read) — enforced in
    `job-technician.repository.ts`'s two write sites, each deriving the
    job's current status inside its own transaction.

- **P16-4 — Shop Identity verification.** Owner smoke test, not an agent
  task (see §4).

### Explicitly out of scope

- Any Settings section beyond the ones listed under P16-1b's SECTIONS
  (General/Sales/Jobs/Data)
- Receipt/invoice design or template changes
- User management, permissions, PIN login, `decided_by` tracking
- Report configuration beyond the P16-3b wage-report change
- Wiring `service_charge.wholesale_charge` into delivery logic (field is
  shown read/write in the admin list only, per SQ-1 of the plan
  discussion — no delivery-time behaviour depends on it this phase)
- Any Type B / Type C Settings Backlog item (`PROJECT.md` §Settings
  Backlog)

---

## 2a. Owner decisions (OD-16-1 – OD-16-12, 2026-09-22 to 2026-09-24)

These replace parts of this document's original draft and are binding.

**OD-16-1 — Commission model replaced.** Phase 7's automatic
per-technician commission (`party.commission_bp`) is retired: no code
reads it any more; the field is hidden from the staff add/list UI; the
column stays (never edit an applied migration); existing `party_ledger`
commission rows from Phase 7 are untouched. Commission is configured
**per service charge**, using `service_charge.commission_amount` /
`commission_bp`: mode = none | fixed paisa | basis points of the
labour line's **charged** amount (post operator-override, pre
invoice-level discount). Default: none.

**OD-16-2 — Delivery never posts commission money.** For each delivered
labour line whose charge has commission configured, delivery writes one
commission **claim** row inside the existing delivery transaction (a
claim is not money). The claim snapshots: job, sale line, service
charge, computed suggested amount in paisa, suggested recipient. Later
edits to the service charge never change an existing claim. Charges with
mode = none create no claim.

**OD-16-3 — Owner approves or rejects claims.** Commission Approvals
lists pending claims (job number, customer, charge name, labour amount,
suggested amount, full technician assignment history including removed
technicians with dates/reasons). Approve: one or more recipients, each
an integer paisa amount > 0. **Recipient rule superseded by OD-16-12
below** (Checkpoint 1b) — "must first be assigned to the job" turned out
to conflict with the P16-3c technician-list lock; see OD-16-12 for the
corrected rule. Reject: requires a non-empty reason.
Approval writes the decision and all `party_ledger` commission rows in
one transaction. Decisions are immutable; corrections are reversing
`party_ledger` rows. Unrestricted by convention until the auth phase
(logged as backlog).

**OD-16-3a — Decision correction path (GAP-1, added 2026-09-22).**
`UNIQUE(claim_id)` alone would make a wrong approval or rejection
uncorrectable in-app — a real gap, since the owner reviewing dozens of
claims will approve one wrong occasionally. Replaced with:

- `commission_decision` gains `attempt_no INTEGER NOT NULL`;
  `UNIQUE(claim_id, attempt_no)` replaces `UNIQUE(claim_id)`.
- New table `commission_decision_reversal` (`id`, `tenant_id`,
  `decision_id` FK **UNIQUE**, `reason` TEXT NOT NULL — non-blank,
  trimmed, enforced in core — `reversed_at`, `created_at`).
- **Reversing an approved decision**: one transaction writes the
  reversal row plus one reversing `party_ledger` row per original
  recipient row (`amount = +original`, opposite sign,
  `entry_date` = the reversal date — not the original decision's date,
  same reasoning as OD-16-4: the ledger dates every row by when that
  financial event actually happened — same `source_type`/`source_id`
  convention as the original — the standard reversal-discovery pattern,
  `DATABASE_RULES.md` §3). **Reversing a rejected decision**: reversal
  row only, no ledger rows.
- Core allows a new decision on a claim only if the claim has no
  decision yet, or its latest decision has a reversal row.
  `attempt_no` = count of existing decisions for that claim + 1.
  Concurrent approval attempts collide on
  `UNIQUE(claim_id, attempt_no)` — the DB backstop, not the only guard.
- **Pending** (for the Approvals list and the pending-count badges) =
  a claim with no decision, or whose latest decision has a reversal
  row.
- UI: decided claims show a "Reverse" action requiring a reason. Kept
  minimal — no edit-in-place, no partial reversal of one recipient out
  of several; reversing undoes the whole decision, and a fresh
  approval (attempt 2) replaces it.

**OD-16-4 — Commission month.** Commission counts in the wage report by
the _approval_ date (`party_ledger.entry_date` = decision date), not the
delivery date. Approved commission shown per technician as today. Total
pending commission (count + suggested amount, **not** split per
technician, since it is not yet owed to anyone) shown once in the report
header.

**OD-16-5 — Technician removal guard (implemented P16-3c).**
`job_technician` rows are never deleted; removal only sets
`unassigned_at` and now also a required `unassign_reason` (new nullable
column, migration `0020`; nullable only because every pre-existing row
predates it, never as "removed for no reason"). Required in the UI and
enforced by `packages/core/src/job/technician-assignment.ts`
(`assertUnassignReasonProvided`), called from
`KyselyJobTechnicianRepository.unassignTechnician` — re-grepped at
implementation time and confirmed still the only write path into
`job_technician.unassigned_at`.

The technician list is locked once the job reaches status **`ready`,
`delivered`, or `cancelled`** — for **both directions**, assigning and
unassigning (not just removal, as an earlier draft of this decision
implied): `assertTechnicianListUnlocked(status, 'assign' | 'unassign')`,
called from both `job_technician` write sites
(`assignTechnicianWrite`/`unassignTechnician`, each deriving the job's
current status from `job_status_history` inside its own transaction —
never the `job.status` column directly, same rule as everywhere else in
this codebase). Enforced in the repository (which is where the current
status is available inside the write transaction), not only the UI —
`TechnicianAssignmentPanel.tsx`'s own `isReadOnly` check is a
convenience that mirrors the same three statuses, never the source of
truth.

**The lock is not sticky.** It re-checks the job's live derived status
on every call. If a job moves backwards from `ready` to an earlier
status (e.g. more work is found after being marked ready, and the
owner reopens it to `in_progress`), the very next assign/unassign call
sees the earlier status and the lock lifts automatically — no special
handling, no "lock stays lifted once granted" state anywhere. Verified
directly: `job-technician.repository.test.ts`'s
`'a job that moves BACKWARDS from ready to an earlier status lifts the
lock — reassigning then succeeds again'`.

**OD-16-6 — Brands.** Brand is stored on the job as `TEXT` (a snapshot;
confirmed — `job.appliance_brand`, no FK). The `brand` table is the pick
list, shared with `item.brandId`. Names trimmed, internal spaces
collapsed, unique case-insensitively per tenant. **`is_active`** (new
column, P16-2) hides a brand from the job-intake dropdown only; it does
not affect CSV/item brand matching, and does not touch `deleted_at`,
whose existing meaning (and existing callers) are untouched by this
phase — see §2c. An existing job's stored text is unaffected by later
brand changes either way. "Other" free text never auto-added to `brand`.
No brand-per-appliance-type mapping.

**OD-16-7 — Seeding.** Brands are reference data: an idempotent
per-tenant bootstrap that, for each starter name, inserts it only if no
`brand` row with that name (case-insensitive) already exists for the
tenant — **including soft-deleted rows** — so it is safe to run on
every app startup without ever attempting a duplicate insert against
`UNIQUE(tenant_id, name)`. Starter list: Dawlance, Haier, PEL, Orient,
Gree, Kenwood, TCL, Samsung, LG, Ecostar, Panasonic, Changhong Ruba,
Homage, Nasgas, Westpoint, Daikin, Mitsubishi, plus the existing
`BRAND_OPTIONS` name not already listed (Waves). Service charges are
test data: a dev-only seed (gated on `!app.isPackaged`, following
`scripts/seed-test-data.ts`'s existing pattern) that can never run
against production, covering at minimum AC Installation (fixed
commission), AC General Service (none), AC Gas Refill (none), Fridge
Gas Charging (none), Compressor Replacement Labour (bp commission),
Oven Repair (none), Checking/Inspection Fee (none). Confirmed: no
migration inserts any `service_charge` row today (searched
`0002_business_units.sql` in full — zero INSERTs) — there is no
existing production risk to avoid here.

**OD-16-8 — Tests.** Phase 7 tests asserting automatic commission are
rewritten to the claim model, not deleted silently (full list in §5).
`docs/decisions/ADR-0015-commission-claims.md` records the model and why
Phase 7's was retired (confirmed: no `ADR-0014` file exists on disk —
the "no hard delete" decision referenced in PROGRESS.md was never
written as an ADR file; commission-claims takes **ADR-0015** rather than
risk a future collision). BUG-COMMISSION-MULTI closes as SUPERSEDED by
ADR-0015 once P16-3a is verified.

**OD-16-9 — No back-fill.** No historical commission back-fill.

**OD-16-10 — Zero-bill delivery.** Unchanged; logged as an open question
in `PROJECT.md` §4, not fixed this phase.

**OD-16-11 — Settings shell redesign (owner, 2026-09-23).** The
stacked-cards `SettingsPage.tsx` layout and the P16-1/§2b-original "Job
Settings" tile → separate page → tabs structure are rejected. Brought
into Phase 16 as task **P16-1b**. Reference: two screenshots of another
product's settings screen (layout pattern only — not its pharmacy
content, not its green colour scheme; Shop ERP's own colours, fonts,
and `@shop/ui` components throughout). Full design in the (superseded)
§2b below, replaced by §2b as currently written.

**OD-16-12 — Recipient rule vs. technician-list lock (owner, 2026-09-24,
P16-3a Checkpoint 1b).** OD-16-3's original recipient rule ("must be
present in the job's assignment history — active or removed") conflicts
with OD-16-5's technician-list lock: claims are approved **after**
delivery, but the technician list is already locked at
ready/delivered/cancelled, so "assign them to the job first" is
impossible by the time an approval happens, and a wrong or missing
technician record would make the correct person unpayable in-app.
Corrected rule:

- A recipient may be **any active staff party** — not limited to the
  job's technician history.
- A recipient **not** in the job's assignment history requires a
  non-blank, trimmed `outside_history_reason` on that recipient row
  (core-enforced and Zod-validated — Checkpoint 2). A recipient who
  **is** in the history stores `NULL` there.
- A **non-staff** party as recipient is rejected outright.
- The Commission Approvals screen (P16-3b, not this phase's scope) flags
  outside-history recipients and shows the stored reason.

Schema: `commission_decision_recipient.outside_history_reason TEXT`,
nullable, added by migration `0019` (Checkpoint 1b — `0018` is never
edited once applied). See §4 for the updated exit-criteria test list.

---

## 2b. Navigation (P16-1b, supersedes the original P16-1 design above)

One Settings shell, not a card stack. Page title ("Settings") + a
one-line subtitle, then a single bordered/shadowed panel split into a
grouped left sub-nav and a routed right content pane.

**Routing.** `react-router-dom` (already a dependency, unused
elsewhere in this app) is added at the root via one `HashRouter`
(`apps/client/src/main.tsx`, wrapping `<App/>`) — `HashRouter`, not
`BrowserRouter`, because the packaged renderer is loaded via
`win.loadFile()` (`file://`), which has no real path-based routing.
Confirmed safe to add: grepped `apps/client` and `apps/server` for
`window.location`/`location.hash`/`href="#"`/any `loadURL`/`loadFile`
call with a hash or query — found none; a single `BrowserWindow` is
ever created, loaded with a bare path/URL. `App.tsx`'s own top-level
`tab` state (the main sidebar) is **unchanged** — only `SettingsPage.tsx`
internally uses `<Routes>`, for absolute paths under `/settings/*`.
`/settings` redirects to `/settings/shop`. Each section is its own
route, so the hash persists across leaving/re-entering the Settings tab
(deep-link-equivalent) and the browser back button works for it.

**Sections and routes:**

| Path                                  | Group   | Title                         |
| ------------------------------------- | ------- | ----------------------------- |
| `/settings`                           | —       | redirects to `/settings/shop` |
| `/settings/shop`                      | General | Shop                          |
| `/settings/invoices`                  | General | Invoices & Receipts           |
| `/settings/sales/discounts`           | Sales   | Discounts                     |
| `/settings/jobs/service-charges`      | Jobs    | Service Charges               |
| `/settings/jobs/brands`               | Jobs    | Brands                        |
| `/settings/jobs/commission-approvals` | Jobs    | Commission Approvals          |
| `/settings/backup`                    | Data    | Backup & Restore              |

The Commission Approvals nav item is reserved to show a pending-claim
count badge once P16-3b lands (`settingsNav.config.ts`'s `SettingsNavItem.badge`
field exists now, unused — no new tables needed, same pending
definition as OD-16-3a: no `commission_decision` row, or the latest
decision has a matching `commission_decision_reversal` row).

**Sections are relocated content, not rewrites**, except where noted:
`ShopIdentityCard.tsx` splits into `ShopSettingsSection.tsx` (name/
phone/address/email) and the text-field half of
`InvoiceReceiptsSettingsSection.tsx` (invoice header/footer, statement
footer); `DiscountPresetsCard.tsx` → `DiscountsSettingsSection.tsx`
(Card wrapper stripped; dirty-tracking added — the original had none,
needed so the unsaved-changes guard works there too);
`ReceiptSettingsCard.tsx`'s paper-size picker folds into
`InvoiceReceiptsSettingsSection.tsx` (see the correction below —
its instant-save behaviour is retired, not relocated as-is);
`BackupRestoreCard.tsx` → `BackupSettingsSection.tsx` (Card wrapper
stripped only — no form, so no dirty-tracking needed).
`ServiceChargesTab.tsx`/`ServiceChargeModal.tsx`/`BrandsTab.tsx`/
`CommissionApprovalsTab.tsx` (P16-1's job/ folder) are unchanged,
just relocated to new routes. `JobSettingsPage.tsx` and
`JobSettingsCard.tsx` are deleted.

**Invoices & Receipts correction (owner, 2026-09-23):** the original
plan proposed two independent Save buttons in this section (invoice
text fields + a separate paper-size save), mirroring the reference
image's nested-save precedent. Rejected: `ReceiptSettingsCard.tsx`'s
A4/A5 buttons saved **instantly** on click
(`changePaperSize` → `setReceiptPaperSize` immediately) — two buttons
in one section would have mixed instant-save and explicit-save inside
what the RULES require to be one explicit-Save section. Paper size is
now a normal form field (`form.paperSize`): part of the section's
dirty computation, sent only when the section's single Save button is
clicked. Save calls the same two existing IPC methods
(`setShopIdentity`, `setReceiptPaperSize`) in sequence — no new
bundling logic beyond that. Either call can fail independently; the
error names which half failed, and only that half's fields stay dirty
(the `saved` snapshot advances to match what was actually written for
the succeeded half). Resending the succeeded half on a retry is
accepted, not treated as a bug.

**Save-time identity fetch (owner correction, 2026-09-23):** both
Shop and Invoices & Receipts call `getShopIdentity()` again at the
moment Save is clicked — not just at mount — and overlay only that
section's edited fields onto the **freshly-fetched** object before
calling `setShopIdentity`. Same 7-field DTO, same two existing IPC
methods as before P16-1b (`getShopIdentity`/`setShopIdentity`,
confirmed by re-reading `shop-identity.repository.ts`: each of the 7
fields is its own row in the generic `setting` table, upserted
independently — a full-object round trip needs no schema change).

**Unsaved-changes guard.** A `SettingsDirtyContext` (dirty boolean +
setter) is provided once at the top of `SettingsPage.tsx`; each
form-bearing section reports its own dirty state into it.
`SettingsNav.tsx` intercepts a sub-nav click only when dirty, showing a
discard/stay `ConfirmDialog` instead of navigating immediately.
**Scoped to sub-nav clicks only** (owner-accepted, 2026-09-23) — it
does not intercept leaving Settings via the main sidebar (`App.tsx`'s
own `tab` state) or the browser back button; logged in `PROJECT.md`'s
Phase 16 backlog: "revisit when main navigation moves to the router."

## 2c. Brand table sharing (C-6 finding, resolved)

`item.brandId` is a real, exercised FK path: `import.repository.ts`
(CSV bulk item import, via `packages/core/src/import/item-import.ts`)
matches `brand.name` (filtered `deleted_at IS NULL`, case-insensitive)
to assign `item.brandId`. No UI sets it directly — item creation
(`item.repository.ts`'s `createItem`) always writes `brandId: null`,
and no `apps/client` file references `brandId`/`brand_id`.

**CSV import does not auto-create brand rows.** Confirmed by reading
`item-import.ts` (lines 156–167): when a CSV row's `Brand / Company`
text does not match any name in `brandIdByName`, the row is **rejected**
outright with reason `Brand "<name>" not found` — no new `brand`
row is ever inserted by the importer. This means P16-2's `is_active`
column needs no "what do auto-created rows get" case to handle; the
question doesn't arise.

**Decision (owner, 2026-09-22): do not reuse `deleted_at` as
"inactive."** Two problems with that approach, both confirmed real:
deactivating a brand via `deleted_at` would break future CSV matching
for that name (the importer filters `deleted_at IS NULL`), and
re-creating a soft-deleted name later would violate
`UNIQUE(tenant_id, name)` since the deleted row still occupies it.

Instead: new migration `0017` adds `brand.is_active INTEGER NOT NULL
DEFAULT 1` (mirrors `service_charge.is_active`'s existing convention).
`is_active` governs **only** the job-intake dropdown (P16-2's
`brand:list` for that purpose filters `is_active = 1`). CSV/item brand
matching is untouched — it keeps filtering `deleted_at IS NULL` only,
exactly as today, and ignores `is_active` entirely. `deleted_at` itself
is not written by any Phase 16 code path. The Settings Brands tab lists
all non-deleted brands (`deleted_at IS NULL`) with an `is_active`
toggle per row.

Test (P16-2): deactivate "Haier" (`is_active = 0`) → hidden from the
job-intake dropdown; a parts CSV row with brand text "Haier" still
resolves to the same `brand.id` and imports successfully; no second
"Haier" row is created by either path.

---

## 3. Tasks

| ID     | Task                                                | Depends on                         | Status                                                                   | Commit  |
| ------ | --------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ | ------- |
| P16-1  | Service charge management                           | —                                  | DONE                                                                     | 55f0438 |
| P16-1b | Settings shell redesign (OD-16-11)                  | P16-1                              | DONE                                                                     | 320e602 |
| P16-2  | Brand management + DB-driven dropdown               | P16-1b (adds a route to the shell) | DONE                                                                     | c0294bf |
| P16-3a | Commission claim schema + core calc + delivery hook | P16-1                              | DONE (Checkpoint 1 7eedff6, Checkpoint 1b 0f6ee92, Checkpoint 2 6e480e2) | 6e480e2 |
| P16-3b | Commission Approvals section + wage report change   | P16-3a, P16-1b                     | DONE                                                                     | —       |
| P16-3c | Technician removal guard                            | —                                  | DONE                                                                     | —       |
| P16-4  | Shop identity verify (owner smoke test)             | —                                  | NOT STARTED                                                              | —       |

Order: P16-1 → P16-1b → P16-2 → P16-3a → P16-3b → P16-3c → P16-4. One
task at a time; verified and reviewed before the next begins.

---

## 4. Exit criteria

Sign convention (confirmed in `0001_init.sql` / Phase 7): `party_ledger`
commission rows use `amount = -commissionPaisa` (negative — "the shop
owes the technician"). `commission_decision`-sourced ledger rows use
`source_type = 'commission_decision', source_id = commission_decision.id`
(the decision, not the claim, is the reversal unit — approving pays N
recipients from one decision; a correction reverses the whole decision
via rows sharing that source, per `DATABASE_RULES.md` §3's existing
pattern).

- **P16-1**: creating a service charge `{name: 'AC Installation (test)',
retailChargePaisa: 300000, commissionMode: 'fixed',
commissionAmountPaisa: 50000}` via the new create channel, then
  reading it back via the admin list, returns exactly those values.
  Toggling `isActive=0` removes it from `lookup.repository.ts`'s
  `listServiceCharges` (delivery dropdown) but keeps it in the admin
  list. Creating a second charge named `"ac installation (test)"`
  (case-insensitive match against the first) is rejected. Commission
  mode is not a stored column — it is derived from
  `commission_amount`/`commission_bp` being set or `NULL`, validated at
  both the Zod boundary and in core: `none` = both `NULL`; `fixed` =
  `commission_amount > 0` and `commission_bp IS NULL`; `bp` =
  `commission_bp` between 1 and 10000 inclusive and
  `commission_amount IS NULL`; both set (or an out-of-range value) is
  rejected by both Zod and a core check — Zod alone cannot express
  "exactly one of two fields," so this is deliberately checked twice.
  **Editing a service charge's retail price after a delivery already
  used it never changes that delivery**: create a charge, deliver a job
  against it, then edit the charge's `retailChargePaisa` — the already-
  delivered `sale_line.description` and `sale_line.unitPrice` are
  unchanged (named test, confirms the SQ-6 snapshot finding from plan
  discussion holds under a real edit, not just by code inspection).
  Verified: named repository tests + one hand-run query.
- **P16-1b**: `/settings` navigates to `/settings/shop` (redirect).
  Clicking each of the 7 sub-nav items routes to its section and shows
  that section's title (`heading`, role-queried). The active nav item
  carries `aria-current="page"`; the previously-active one does not,
  after switching. Switching sections with a clean form navigates
  immediately, no dialog. Switching with a dirty form shows "Discard
  unsaved changes?" — Stay keeps the edit and the current section; a
  second attempt + Discard navigates and the edit is gone. After a
  successful save, switching sections shows no dialog (dirty correctly
  cleared). A failed save keeps the form dirty (error shown, edited
  value still in the field, switching away still prompts). Shop and
  Invoices & Receipts: saving calls `getShopIdentity()` a **second**
  time at Save (not just at mount) and `setShopIdentity()` with that
  fresh fetch's untouched fields overlaid with only this section's
  edits — proven by mocking `getShopIdentity` to return different
  values on its first (mount) and second (save) call and asserting the
  second call's values win. Invoices & Receipts: Save calls
  `setShopIdentity` and `setReceiptPaperSize` in sequence; changing
  A4/A5 alone marks the section dirty without calling
  `setReceiptPaperSize` until Save is clicked; if `setReceiptPaperSize`
  fails while `setShopIdentity` succeeds, the error names paper size
  specifically and the section stays dirty (resending the already-saved
  text half on retry is accepted, not a bug). Verified: named tests in
  `SettingsPage.test.tsx`, `ShopSettingsSection.test.tsx`,
  `InvoiceReceiptsSettingsSection.test.tsx`.
- **P16-2**: a fresh DB, after bootstrap, has **exactly 18** brand rows
  (not merely "at least"): Dawlance, Haier, PEL, Orient, Gree, Kenwood,
  TCL, Samsung, LG, Ecostar, Panasonic, Changhong Ruba, Homage, Nasgas,
  Westpoint, Daikin, Mitsubishi, Waves — all `is_active = 1`, no
  case-insensitive duplicates. Creating `"gree"` when `"Gree"` exists
  (active or soft-deleted) is rejected. Running the bootstrap a second
  time inserts nothing new (still exactly 18). Deactivating "Haier"
  (`is_active = 0`) removes it from the job-intake dropdown (`brand:list`
  filtered for that use) but a subsequent parts CSV import row with
  brand text "Haier" still resolves to the same `brand.id` and the row
  is accepted, not rejected — no second "Haier" row exists afterward.
  Verified: named repository tests (bootstrap idempotency — exact count
  asserted, not a lower bound; uniqueness-including-deleted; is_active
  toggle) + one named import-repository test reusing the existing CSV
  import test fixtures + hand-run queries.
- **P16-3a** (all hand-calculated):
  - Charge "AC Installation," retail 300000 paisa, fixed commission
    50000 paisa, delivered at charged (undiscounted) price → one
    `commission_claim` row, `suggested_amount_paisa = 50000`.
    `sale_line_id` is set and `UNIQUE` — a second claim can never be
    created against the same labour line (DB-enforced).
  - Quantity-milli 2000 case (pure-function unit test, since the live
    delivery path always uses `quantityMilli = 1000` for labour today):
    fixed commission 50000 paisa at `quantity_milli = 2000`. Expected:
    `FLOOR(50000 * 2000 / 1000) = 100000`.
  - Charge "Compressor Replacement Labour," 1000 bp, charged (with an
    operator price override) at 400000 paisa. Expected:
    `FLOOR(400000 * 1000 / 10000) = 40000`.
  - FLOOR exercised with a non-round remainder: bp 1234 on a charged
    line of 99999 paisa. `99999 * 1234 = 123398766`;
    `123398766 / 10000 = 12339.8766` → `FLOOR = 12339`. Suggested amount
    must be exactly `12339`, not `12340` (confirms truncation, not
    rounding).
  - Charge with `commissionMode = none` → zero claim rows for that line.
  - Suggested recipient: job has technicians A (assigned first, then
    removed before delivery) and B (assigned after A, still active at
    delivery) → suggested recipient is **B** (earliest-assigned
    technician still active at delivery), not `job.assignedTo` (which
    still points at A, per P14-1's "set once" rule) and not A.
  - Suggested recipient is **`NULL`** when no technician is active on
    the job at delivery time (e.g. the sole assigned technician was
    removed and never replaced) — the claim is still created (money
    isn't lost), just with no suggestion; the owner must pick a
    recipient manually at approval.
  - Approve a claim as 30000 + 20000 to two technicians both present in
    the job's assignment history (one active, one previously removed) →
    exactly two `party_ledger` commission rows (`amount = -30000`,
    `amount = -20000`, `entryType = 'commission'`, `entryDate` =
    decision date), sum 50000, one `commission_decision` row
    (`attemptNo = 1`), two `commission_decision_recipient` rows.
  - Approval validation (all rejected before any write): the same
    technician listed twice among recipients; any recipient
    `amountPaisa <= 0`; a reject reason that is whitespace-only (e.g.
    `"   "`) — trimmed length must be `> 0`, so whitespace counts as
    empty, not as a value.
  - A recipient **not** in the job's assignment history, with no
    `outsideHistoryReason` given → rejected by core before any write;
    nothing written (OD-16-12).
  - The same recipient not in the job's assignment history, **with** a
    non-blank trimmed `outsideHistoryReason` → accepted; the reason is
    stored on that `commission_decision_recipient` row exactly as given
    (OD-16-12).
  - A recipient who is a **non-staff** party (e.g. a customer or
    supplier party id) → rejected by core before any write, regardless
    of any reason given (OD-16-12).
  - **GAP-1 correction path** (OD-16-3a):
    - Approve a claim for 50000 to technician X, then reverse that
      decision with a reason → one `commission_decision_reversal` row;
      one reversing `party_ledger` row (`amount = +50000`,
      `entryType = 'commission'`, same `sourceType`/`sourceId` as the
      original) → net `party_ledger` sum for that decision's source is
      `0`. The claim is pending again.
    - Re-approve the same (now-pending) claim for 50000 to a
      **different** technician Y → new `commission_decision` row,
      `attemptNo = 2`; Y is paid `-50000`; X's net across both decisions
      is `0` (the original `-50000` plus the `+50000` reversal).
    - Reversing the same decision a second time is rejected by core
      (a decision already has a reversal), with
      `UNIQUE(commission_decision_reversal.decision_id)` as the DB
      backstop — test asserts both the rejection and that no second
      reversal row exists.
    - Reversing a **rejected** decision (not an approved one) writes
      only the reversal row, zero `party_ledger` rows, and the claim
      becomes pending again — verified by a named test distinct from
      the approved-decision reversal test above.
    - **Multi-recipient reversal** (FIX-2, added 2026-09-22): reverse
      the 30000 + 20000 two-recipient approval from the earlier
      criterion → exactly two reversing `party_ledger` rows
      (`amount = +30000`, `amount = +20000`), each technician's net for
      that decision's source is `0`, claim pending again.
    - **Repository-level constraint test** (FIX-3, reworded 2026-09-22
      — `better-sqlite3` is synchronous and single-writer inside one
      process, so genuine concurrent writes cannot occur here; this is
      a direct constraint test, not a concurrency simulation): inserting
      two `commission_decision` rows with the same
      `(claim_id, attempt_no)` fails on the second insert with a
      `UNIQUE` constraint violation — asserted directly against the
      repository, not through the core "already decided" check (which
      should normally prevent this from ever being attempted; this
      test proves the DB-level backstop holds even if that check is
      bypassed or has a bug).
  - **Month attribution** (OD-16-4): a job delivered 2026-09-30 whose
    claim is approved 2026-10-02 is counted in the **October** wage
    report (the approval month), not September — the delivery month
    contributes nothing to that technician's commission total, even
    though the claim itself was created in September.
  - **Rewritten test**: a claim-insert failure (e.g. a constraint
    violation) rolls back the **entire delivery** — no `sale`, no
    `sale_line`, no stock movement, no claim survive — since claim
    creation now happens inside `deliverJob`'s existing transaction
    (C-1/C-5), the exact opposite of Phase 7's "commission failure never
    rolls back delivery" behaviour, which is being deliberately retired.
  - `npm run verify` passes; final test count reported exactly (see §5
    for the per-task delta).
- **P16-3b**: UI action — approve the seeded pending claim, confirm it
  leaves the pending list, confirm the wage report for that
  technician/month increases by the approved amount, confirm the
  report's pending-commission header total decreases by the claim's
  suggested amount (not per-technician). Reverse a decided claim from
  the UI (reason required) and confirm it reappears in the pending list.
  **Wage-report sign fix (FIX-1), hand-calculated:**
  - Technician X approved for 50000 paisa on 2026-09-28, reversed on
    2026-10-02. September wage report: X's `commissionPaisa = 50000`.
    October wage report: X's `commissionPaisa = -50000`, and
    `netPaisa` is reduced by 50000 versus a month with no ledger
    activity — the clawback actually lowers what the shop owes X that
    month.
  - Approve and reverse within the **same** month → that month's
    `commissionPaisa = 0` for that technician (the `-50000` and
    `+50000` rows both fall in the same `strftime('%Y-%m', entry_date)`
    bucket and net to zero).
  - Every existing Phase 7 `wage-report.repository.test.ts` test still
    passes unchanged after dropping `ABS` and negating instead —
    confirmed by hand: for any pre-reversal, approval-only month,
    `-COALESCE(SUM(amount), 0)` and `ABS(...)` produce the identical
    result, since every row in that scenario is already negative.
- **P16-3c (actual outcome)**: `job:unassignTechnician` with no reason →
  Zod rejection (`UnassignTechnicianInput`'s `reason` field, trimmed
  non-blank); a whitespace-only reason rejected the same way, both at
  the Zod boundary and again by the repository's own
  `assertUnassignReasonProvided` call for a caller that bypasses Zod.
  **Both assign AND unassign** called (directly, bypassing the UI) on a
  job at status `ready`, `delivered`, or `cancelled` → repository-level
  rejection, one named test per status per direction (6 cases total, not
  3 — the lock was widened during implementation to cover assign as
  well as unassign, per this checkpoint's own instruction). **Positive
  case**: unassign called on a job at status `in_progress` with a
  non-empty reason → succeeds, `unassign_reason` and `unassigned_at` are
  stored on the `job_technician` row exactly as given, the row is not
  deleted. **Lock-lifts case**: a job moved from `ready` back to
  `in_progress` unlocks the list again — one named test. The commission
  claim detail (P16-3b's `ClaimDetailModal.tsx` / `getClaimDetail`) now
  shows the stored removal reason — one named test confirming the
  reason threads all the way from `job_technician.unassign_reason`
  through to the DTO.
- **P16-4**: owner manually confirms Shop Identity persists across
  restart and prints on an invoice. Not agent-verifiable — checklist
  only:
  - [ ] Open Settings, edit shop name, Save
  - [ ] Restart the app
  - [ ] Confirm the new name is still shown in Settings
  - [ ] Print/preview an invoice, confirm the shop name appears

---

## 5. Rewritten/added tests and expected count delta

Baseline: 649/649 (commit f9cc7b8).

**Actual counts landed so far** (not estimates — each is this task's own
verified `npm run verify` count):

- P16-1 (`55f0438`): 649 → 665 (+16: contracts Zod validation ×4, core
  `assertCommissionModeConsistent` ×5, repository CRUD/uniqueness/
  snapshot-survives-edit ×6, 1 UI smoke test).
- P16-1 review fix (`361c658`): 665 → 672 (+7: `Money.fromPercent`/
  `fromRupees` conversion tests ×3, `ServiceChargeModal` conversion
  tests ×4).
- P16-1b (`320e602`): 672 → 690 (+18: `SettingsPage.test.tsx` ×13 —
  redirect, 7× routing, active-highlight, clean-switch-no-dialog,
  dirty-switch-confirm/stay/discard, no-dialog-after-successful-save,
  failed-save-stays-dirty; `ShopSettingsSection.test.tsx` ×2 — save-time
  fresh-fetch overlay, failed-save-stays-dirty;
  `InvoiceReceiptsSettingsSection.test.tsx` ×3 — sequential save of both
  IPC calls, A4/A5-dirty-without-instant-save, paper-size-failure-
  names-itself-and-stays-dirty).
- P16-1b review fix, FIX-A/FIX-B (`2804cd4`): 690 → 693 (+3: blank-
  Settings catch-all redirect from "/", from an unrecognized
  `/settings/*` path, and a valid deep link renders directly with no
  redirect — `SettingsPage.test.tsx`).
- P16-2 (`c0294bf`): 693 → 710 (+17: `brand.repository.test.ts` ×5,
  contracts `brand.test.ts` ×4, core `brand.service.test.ts` ×3
  (`normalizeBrandName`), `bootstrap.test.ts` ×2 new (exactly-18-brands,
  no-recreate-after-soft-delete), `import.repository.test.ts` ×1
  (deactivated Haier still matches CSV import, no second row),
  `BrandsTab.test.tsx` ×1, `JobCreateForm.test.tsx` ×1 (brand-list-
  load-failure never blocks intake)).
- P16-3a Checkpoint 1 (`7eedff6`): 710 → 727 (+17: `commission-claim.test.ts`
  ×11 (`computeSuggestedCommissionPaisa` ×7, `suggestCommissionRecipient`
  ×4), `commission-claim.repository.test.ts` ×6 (schema constraints)).
- P16-3a Checkpoint 1b (`0f6ee92`): 727 → 729 (+2: `commission-claim.test.ts`
  ×1 new tie-break test (FIX-C3), `migration-runner.test.ts` ×1 new
  0019-column-defaults test).
- P16-3a Checkpoint 2 (`6e480e2`): 729 → 761 (+32 net — see below for the
  exact rewritten/deleted/added breakdown; `commission.repository.test.ts`
  (5 tests, corrected — an earlier report of this session miscounted it
  as 4) and `commission.service.test.ts` (5 tests) deleted outright, 10
  total, replaced as detailed in "Rewritten from Phase 7" below).
- P16-3a Checkpoint 2 review fixes, FIX-D1/D2/D3 (`a9f9b7b`): 761 → 785
  (+24: FIX-D1 ×1 (in-history reason discarded, stored NULL),
  FIX-D2 ×2 (approve/reverse atomicity, forced via the same test-only
  SQLite trigger technique as the delivery rollback test), FIX-D3 ×21
  (`commission-decision.test.ts`, contracts — every commission:* Zod
  input)).
- P16-3b: 785 → 799 (+14: `wage-report.repository.test.ts` ×3 (FIX-1 —
  Sep +50000/Oct -50000 sign fix, same-month nets-to-zero,
  delivered-Sep-approved-Oct counted in October), `commission-decision.repository.test.ts`
  ×4 (`listAllClaims` — pending/approved/rejected status, reversed
  decision returns to pending), `CommissionApprovalsTab.test.tsx` ×2
  (list + basis text + pending header total, empty state),
  `ClaimDetailModal.test.tsx` ×3 (approve prefilled in-history recipient,
  outside-history flag blocks approval until a reason is given, Reverse
  requires a reason), `SettingsPage.test.tsx` ×2 (pending-count badge
  shown/not-shown)).
- P16-3b review fixes (items 1/3/4/5 below): 799 → 805 (+6:
  `WageMonthReport.test.tsx` ×2 (the wage-report's own pending-commission
  header total — missed in the first pass, this fix adds it — and its
  zero-pending case), `SettingsPage.test.tsx` ×1 (sub-nav badge
  refreshes immediately after an in-modal approve, not only on
  remount), `ClaimDetailModal.test.tsx` ×3 (null-suggestion prefills the
  Approve row empty, the total-vs-suggested difference display, and
  Money.fromRupees conversion/invalid-input handling)).

**P16-3b review findings (owner, 2026-09-25) — all fixed in the same
session, before approval:**

1. The wage-report header itself never got the ONE pending-commission
   total (count + suggested amount) the spec required — only
   `CommissionApprovalsTab`'s own header got one. Added to
   `WageMonthReport.tsx`: a second `useEffect` calls
   `ipc.commission.listPending()` independently of the month/year
   filter (a pending claim isn't attributed to any month until
   approved), shown as one line, never split per technician.
2. This session's own earlier report undercounted
   `commission.repository.test.ts`'s deleted tests as 4 instead of 5
   (10 deleted total, not 9) — corrected above and in the
   "Rewritten from Phase 7" list below.
3. `ClaimDetailModal.tsx` had the total-vs-suggested diff and the
   Money.fromRupees conversion path implemented but untested — added
   both cases (diff text only appears once the amount is actually
   edited away from the suggestion; "300.50" → 30050 paisa; a
   genuinely unparseable amount like "." and a syntactically-valid-but-
   zero amount are both blocked with no IPC call, via two different
   guards).
4. The pending-count badge (`SettingsNav.tsx`) only fetched once on
   mount — approving/rejecting/reversing inside
   `CommissionApprovalsTab`'s modal never updated it until a full
   remount. Fixed with a new `CommissionRefreshContext` (same
   no-op-default shape as `SettingsDirtyContext`, since `SettingsNav`
   and `CommissionApprovalsTab` are siblings under `SettingsPage`, not
   parent/child): `CommissionApprovalsTab` bumps a shared token after
   any successful decision, `SettingsNav`'s pending-count effect
   depends on that token and refetches.
5. Approve-row prefill (suggested recipient + suggested amount) was
   already implemented but had no assertion confirming it, and the
   null-suggestion case (empty recipient, but the suggested amount
   still prefills) had no test at all — added both.

- P16-3c: 805 → 845 (+40: `technician-assignment.test.ts` (core, new
  file) ×14 — `assertTechnicianListUnlocked` × 3 locked statuses ×
  2 directions (assign/unassign) = 6 throw cases + 5 unlocked-statuses
  not-throw cases, `assertUnassignReasonProvided` × 3;
  `job.service.test.ts` ×1 (`unassignTechnician` pass-through);
  `job.test.ts` (contracts, new file) ×7 (`UnassignTechnicianInput`'s
  reason field × 5, `TechnicianAssignmentDto`'s `unassignReason` × 2);
  `job-history-events.test.ts` ×1 (a legacy pre-OD-16-5 row with no
  stored reason falls back to the plain wording);
  `job-technician.repository.test.ts` (new file) ×12 — assign rejected
  on ready/delivered/cancelled ×3 + succeeds on in_progress ×1, unassign
  rejected on ready/delivered/cancelled ×3 + empty/whitespace reason
  rejected ×2 + succeeds with a reason stored ×1 + unknown-id throws ×1
  - the lock-lifts-going-backwards case ×1;
    `TechnicianAssignmentPanel.test.tsx` (new file) ×3 (reason required
    before Confirm, locked-status shows no controls + explanation, a
    removed technician shows its date and reason);
    `migration-runner.test.ts` ×1 (0020 column check);
    `commission-decision.repository.test.ts` ×1 (claim detail surfaces
    the stored removal reason)).

**Rewritten from Phase 7 — actual outcome (Checkpoint 2).** Both
`commission.repository.test.ts` and `commission.service.test.ts` were
deleted outright (their subject files no longer exist — Phase 7's
`recordCommission`/`getLabourTotalPaisa`/`computeCommission` are all
retired). Each of their tests' _intent_ survives as a new test
elsewhere:

1. `'inserts correct party_ledger row — commissionPaisa = 12000
(pre-computed)'` → `commission-decision.repository.test.ts`'s
   `'approves 50000 to one in-history technician — one
commission_decision (attemptNo=1), one recipient row, one party_ledger
row amount=-50000'`.
2. `'recordCommission with commissionPaisa = 0 throws, inserts nothing'`
   → `commission-decision.repository.test.ts`'s `'validation: a
recipient amountPaisa <= 0 is rejected before any write'`, joined by
   sibling validation tests for a duplicate recipient, OD-16-12's
   recipient rule (both directions), and a non-staff recipient.
3. `'PARTS-unit lines do not contribute to commission — only the REPAIR
labour line counts'` → `job-delivery.repository.test.ts`'s `'a part
line never produces a commission_claim row, even on a delivery that
also has a commissioned labour line'`.
4. `'EC-P7-6: Rs 1,200 labour, 10% commission -> exactly 12000 paisa,
technician with commission_bp=0 gets nothing'` → split into
   `commission-claim.test.ts`'s pure-function hand-calc tests (already
   landed at Checkpoint 1) plus `job-delivery.repository.test.ts`'s `'a
labour line on a charge with commission mode "none" creates no
commission_claim row'` (the `commission_bp = 0`-on-party concept no
   longer exists post-OD-16-1).
5. `'a commission recording failure does not roll back the delivery'` →
   **inverted**, exactly per ADR-0015: `job-delivery.repository.test.ts`'s
   `'a claim insert failure rolls back the entire delivery — no sale,
sale_line, stock movement, or claim survive (ADR-0015, inverted from
Phase 7's isolated-failure behaviour)'`, forced via a test-only
   SQLite trigger on `commission_claim` (never a schema/migration
   change — scoped to that one test's ephemeral DB).

`commission.service.test.ts`'s `computeCommission` tests have no direct
descendant — `commission-claim.test.ts`'s `computeSuggestedCommissionPaisa`
tests (already landed at Checkpoint 1) cover the same FLOOR-arithmetic
ground under the new claim model.

**Net new tests this phase** (final, as built):

- P16-1: 10 (create/edit/toggle/uniqueness/list-excludes-inactive ×
  repository, commission-mode derivation validation — none/fixed/bp/
  both-set-rejected, duplicate-name-case-insensitive rejection,
  edit-price-after-delivery-leaves-past-invoice-unchanged, + 1 UI test)
- P16-2: 7 (create/toggle/case-insensitive-uniqueness-including-deleted/
  bootstrap-exact-count-18/bootstrap-idempotent-rerun × repository,
  1 named CSV-import-still-matches-deactivated-brand test, + 1 UI test)
- P16-3a Checkpoint 1: 17 (`commission-claim.test.ts` ×11,
  `commission-claim.repository.test.ts` ×6 schema constraints)
- P16-3a Checkpoint 1b: 2 (tie-break test FIX-C3, 0019 column-defaults
  test)
- P16-3a Checkpoint 2: net +32 (−10 deleted Phase 7 tests, +6
  `job-delivery.repository.test.ts` new commission-claim-integration
  tests including the inverted rollback test, +19
  `commission-decision.repository.test.ts` — approve/reject/reverse/
  list/detail including GAP-1 (reverse-nets-zero,
  reapprove-as-attempt-2-to-different-technician, double-reversal-
  rejected, reverse-a-rejected-decision-no-ledger-rows,
  multi-recipient-reversal) and OD-16-12 (outside-history-rejected,
  outside-history-with-reason-accepted, non-staff-rejected), +17
  `commission-decision.test.ts` (core) pure-validator unit tests)
- P16-3a Checkpoint 2 review fixes (FIX-D1/D2/D3): +24 (see above)
- P16-3b: +14 (see above — the ~8 estimate from planning undercounted;
  the actual UI (list + detail/approve/reject/reverse modal) needed
  more granular coverage: an outside-history-flag-blocks-approval case
  the estimate didn't anticipate, plus a dedicated badge-shown/
  not-shown pair instead of folding the badge into the approve-flow
  test)
- P16-3c: 40 (see above — the ~5 estimate covered only the
  unassign-side rejection cases; the actual scope widened to lock BOTH
  assign and unassign, needed dedicated new-file test suites for the
  pure core module, the repository, and the UI panel, plus threading
  the removal reason through to the commission claim detail)
- P16-4: 0 (manual checklist only)

Each task's commit states the exact before/after count from its own
`npm run verify` run — the estimate above is not to be treated as
verified until each task lands.

---

## 6. Backlog additions (PROJECT.md — logged, not built this phase)

- Commission approvals must be owner-only once the auth phase exists;
  record `decided_by` (user) then, not now.
- `ADR-0014` is referenced in PROGRESS.md (job hard-delete / Cancel not
  Void) but no such file exists in `docs/decisions/` — write it, or
  correct the reference, in a documentation pass.
- If a delivered job is ever voided (Q-VOID, open), define what happens
  to its undecided and already-approved commission claims — not
  designed this phase.
- Go-live clean-start procedure (OD-16-9): production database must
  start with no test jobs, ledger rows, staff, or service charges before
  2026-10-31.
- Zero-bill delivery (OD-16-10): the delivery modal allows "Deliver &
  Invoice" with no parts and no labour (Rs 0) — legitimate for
  warranty/free-check jobs, or a missing guard? Owner to decide.
