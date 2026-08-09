# ADR-0007: Payer is per line, not per job

**Status:** Accepted · **Date:** 2026-08-08

## Context

The client has a Dawlance contract. On a new-AC installation, Dawlance pays the
installation fee. The box contains standard pipe; if the run is longer, extra
pipe comes from the spare parts shop and **the customer pays for it**.

## Decision

`payer_party_id` and `revenue_type` live on the **line**, not on the job.

## Reasoning

One job legitimately has two payers. A job-level `bill_to_party_id` cannot
represent "Dawlance pays labour, customer pays the extra pipe" without splitting
the job into two documents, which does not match how the work actually happens.

## Consequences

- Job delivery can produce more than one invoice, or one invoice with a
  per-line payer split — decide in Phase 6.
- Contract claims to Dawlance batch only the lines where `payer = Dawlance`.
- Fridge warranty parts liability is still OPEN (Q5) and uses the same mechanism
  once answered.
