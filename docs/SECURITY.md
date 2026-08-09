# Security Model

## Threat model — be honest about what this actually is

This is a single-PC application in a shop in Malakand. The realistic threats,
in order:

1. **Staff manipulating records** — deleting a sale after pocketing cash,
   editing a customer balance, adjusting stock to cover a shortage.
2. **Data loss** — power cut, disk failure, stolen laptop, ransomware.
3. **Physical access** — anyone who sits at the counter PC.
4. **Remote attack** — effectively zero in offline mode.

Design accordingly. **Audit logging and backups matter more here than
cryptography.** Do not spend Phase 1 on threat models that do not apply.

## Controls

| Threat                   | Control                                                                                          | Phase |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ----- |
| Staff deleting a sale    | No hard deletes; cancellation is a reversing entry with a mandatory reason, attributed to a user | 3     |
| Staff editing balances   | `party_ledger` is append-only; adjustments require owner role + reason                           | 3     |
| Staff seeing cost prices | Purchase cost visible to owner/manager only, enforced in main process                            | 3     |
| Stock shrinkage          | Adjustments require a reason; adjustment report by user                                          | 6     |
| Power cut                | WAL + `synchronous=FULL` + UPS; pull-plug test in Phase 5                                        | 0, 5  |
| Disk failure / theft     | Encrypted backups, 30-day rotation, tested restore                                               | 4     |
| Casual physical access   | Per-user login, auto-lock after inactivity                                                       | 3     |
| Weak passwords           | argon2id, minimum length, no reuse of the owner account by staff                                 | 3     |

## Roles

| Role         | Can                                                                                  |
| ------------ | ------------------------------------------------------------------------------------ |
| `owner`      | Everything, including costs, price edits, cancellations, adjustments, backup/restore |
| `manager`    | Everything except user management, price edits, and restore                          |
| `salesman`   | Create sales, receive payments, view stock **without** cost                          |
| `technician` | View assigned jobs, record parts used, update job status                             |

**Permissions are enforced in the main process.** Hiding a button in the UI is
convenience, not a control. Every IPC handler checks the caller's role.

## Secrets

- No secrets in the repo. `.env` is git-ignored; `.env.example` documents keys.
- No API keys required in offline mode. When cloud arrives, tokens go in the OS
  keychain (`keytar`), never in the database or a plain file.
- Nothing sensitive is logged: no passwords, no full CNIC, no tokens.
