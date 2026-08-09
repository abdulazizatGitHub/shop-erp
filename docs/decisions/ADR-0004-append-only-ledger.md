# ADR-0004: Stock and ledger are append-only

**Status:** Accepted · **Date:** 2026-08-08

## Decision

`stock_movement` and `party_ledger` are INSERT-only. Current values are derived
by summation. Corrections are reversing rows.

## Reasoning

1. A mutable quantity column can be silently corrupted by any bug; a sum over
   immutable rows cannot.
2. Full audit trail comes free — essential when the main security threat is
   staff manipulating records.
3. It makes future multi-device sync tractable: two offline devices both INSERT,
   nothing conflicts, and stock going negative is surfaced rather than lost.
4. It matches how accounting actually works — corrections are journal entries,
   not edits.

## Consequences

- Reads are aggregations. Fine at this scale; `stock_balance_cache` exists as a
  rebuildable optimisation if ever measured as slow.
- Cancelling a document never deletes rows.
