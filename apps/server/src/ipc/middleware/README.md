# IPC middleware

Order is fixed and matters:

```
withLogging -> withAuth -> withValidation -> withAudit -> withError
```

**Auth before validation.** An unauthorised caller is rejected before any
payload parsing happens.

| Middleware       | Responsibility                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `withLogging`    | Channel, user, duration. No payload contents (may hold customer data).                   |
| `withAuth`       | Role check. **This is the security boundary** — not the hidden button in the UI.         |
| `withValidation` | `schema.parse(payload)` using a contract from `@shop/contracts`.                         |
| `withAudit`      | Writes `audit_log` for mutating channels only.                                           |
| `withError`      | Domain error -> `{ code, message, details }`. Never leaks a stack trace to the renderer. |

Handlers must stay thin: declare the pipeline, call one service method, return.
Business rules belong in `packages/core`.
