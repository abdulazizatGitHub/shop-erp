# Database Rules — Integrity, Transactions, Security

Money and stock correctness is the product. These rules are not negotiable.

---

## 1. Connection settings

Set on **every** connection, before any query:

```ts
db.pragma('journal_mode = WAL'); // survives most crashes
db.pragma('foreign_keys = ON'); // OFF by default in SQLite — must be set
db.pragma('synchronous = FULL'); // power cuts are the top risk in Malakand
db.pragma('busy_timeout = 5000');
```

`synchronous = FULL` is slower than `NORMAL`. At this transaction volume the
difference is imperceptible, and the client's shop loses power regularly.
**Do not "optimise" this.**

---

## 2. Transactions

**Any operation touching more than one table runs in one transaction.**

A sale writes to four tables. All four succeed or none do:

```ts
const createSale = db.transaction((input: CreateSaleInput) => {
  const sale = insertSale(input);
  insertSaleLines(sale.id, input.lines);
  insertStockMovements(sale.id, input.lines); // negative quantities
  insertLedgerEntry(sale.id, input); // if credit
  insertOutbox('sale', sale.id);
  return sale;
});
```

Rules:

- Transactions are **synchronous** with better-sqlite3. Never `await` inside one.
- Do no I/O inside a transaction — no printing, no file writes, no network.
- Keep them short. Validate everything **before** opening the transaction.
- Never nest transactions manually; use `.deferred()` / savepoints if required.

---

## 3. Data integrity

### Append-only tables

`stock_movement` and `party_ledger` are **INSERT only**.

- No `UPDATE`. No `DELETE`.
- Corrections insert a reversing row and set `reversed_by_id` on the original.
- Any code path that updates these tables is a **CRITICAL** bug.

### Soft delete everywhere else

`deleted_at TIMESTAMP NULL`. Never hard-delete a row that has been referenced by
a transaction. Filter `WHERE deleted_at IS NULL` in every read.

### Snapshots

Documents store a snapshot of the values used at the time:

- `sale_line.unit_cost` — cost at sale time, for margin reporting
- `sale_line.description` — item name at sale time

If a price or name changes later, **historical documents must not change.**
Re-deriving them from the current item master is a bug.

### Constraints

- `NOT NULL` on everything that logically cannot be null.
- Foreign keys on every reference, always enforced.
- `UNIQUE (tenant_id, doc_no)` on every document table.
- `CHECK` constraints for enum-like columns where the set is stable.

---

## 4. Migrations

- Numbered, forward-only: `0001_init.sql`, `0002_business_units.sql`.
- **Never edit a migration that has been applied to any real database.** Write a new one.
- Every migration is wrapped in a transaction.
- The runner records applied versions in `schema_migration`.
- **The runner backs up the database file before applying anything.**
- Every migration is tested against a copy of real client data before deployment.

---

## 5. Security

### Local database

- The DB file lives in the OS app-data directory, not `Program Files`.
- SQLCipher (or an equivalent) if the client wants encryption at rest — decide
  before Phase 5, since retrofitting means a data migration.
- Backups are **encrypted**. They will end up on WhatsApp or a USB stick.

### Access control

- Passwords hashed with **argon2id**. Never bcrypt-with-low-cost, never MD5/SHA.
- Roles: `owner`, `manager`, `salesman`, `technician`.
- **Permissions are enforced in the main process, not the renderer.**
  Hiding a button is UX, not security.
- Sensitive actions always require the owner role: viewing purchase cost,
  editing prices, cancelling a document, adjusting stock, restoring a backup.

### SQL

- **Parameterised queries only.** No string concatenation into SQL, ever.
- Kysely's query builder by default. Raw SQL only where unavoidable, and always
  parameterised.

### IPC

- The renderer has `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`.
- A narrow, explicit preload API. No exposing `ipcRenderer` directly.
- Every handler validates its input with Zod before touching the database.

### Audit

- Every mutation writes to `audit_log` with user, timestamp, table, record, and changed fields.
- Cancellations and adjustments require a reason string. This is what protects
  the owner against staff theft — the most likely real-world security threat here,
  far more than a remote attacker.

---

## 6. Performance

At 500 transactions/day none of this is urgent, but it is nearly free:

- Index every foreign key and every column used in a `WHERE` or `ORDER BY`.
- Item search uses an index on `(tenant_id, name_en)`; add FTS5 only if search feels slow.
- Compute stock from `stock_movement`. Add `stock_balance_cache` **only when
  measured as slow**, and provide a rebuild command.
- Never `SELECT *` in application code.

---

## 7. Backup

- Manual "Backup now" button from day one.
- Automatic backup on application close.
- Keep the last 30 daily backups, rotating.
- **A backup that has never been restored is not a backup.** Test restore in Phase 4
  and again in Phase 5, on a different machine.
