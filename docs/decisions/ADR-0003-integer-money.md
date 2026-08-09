# ADR-0003: Money as INTEGER paisa, quantity as INTEGER milli-units

**Status:** Accepted · **Date:** 2026-08-08

## Decision

All money stored and computed as integer paisa. All quantities as integer
milli-units (qty × 1000).

## Reasoning

Floating point money produces balances that are wrong by 0.01 and the cause is
almost impossible to locate afterwards. For an application whose entire value is
"how much does this customer owe me", that is fatal. Integers make it impossible.

Quantities need fractions (34.5 kg of gas, 12.5 ft of pipe) so they cannot be
plain integers of the base unit — milli-units give three decimal places with
integer safety.

## Consequences

- All money variables end in `Paisa`, all quantities in `Milli`. Lint-enforced.
- Formatting and parsing happen only in `MoneyDisplay` / `NumberField`.
- Division must round explicitly and consistently (round half up, documented).
