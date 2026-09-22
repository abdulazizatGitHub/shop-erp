# ADR-0014: Hard delete of job records is not supported

**Status:** Accepted · **Date:** 2026-09-22

## Decision

Hard delete of job records is not supported and will not be built.
Cancel (with reason) is the correct action for all pre-delivery job
closures, including mistakes and customer withdrawals before work
starts. A job created by mistake should be cancelled with reason
"Created in error." Voiding (a softer form of cancel) is deferred to a
future phase if operationally needed (see Q-VOID, `PROJECT.md` §5 Open
Questions).

## Reasoning

Cancel preserves the audit trail; a hard delete would not.

## Consequences

- Docs-only decision — no build was required in the I2/I3 session it
  was logged in (`PROGRESS.md`, Session 75, 2026-09-22).
- Q-VOID (a job created by mistake currently requires Cancel, which
  leaves a record with reason "Created in error" — is a softer Void
  status needed?) is logged as OPEN and deferred: if the owner finds
  cancelled-in-error jobs polluting reports, a Void status (excluded
  from all reports) can be added in a future phase. Cancel is
  sufficient for now.
