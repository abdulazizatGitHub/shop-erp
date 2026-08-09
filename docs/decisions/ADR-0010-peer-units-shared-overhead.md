# ADR-0010: Peer business units with a shared overhead pool

**Status:** Accepted · **Date:** 2026-08-09

## Context

The client was explicit that Spare Parts and Repair are two separate businesses
under one owner, not a parts shop with a repair department. Earlier design
documentation drew Repair beneath Spare Parts, implying a hierarchy that was
never in the schema but did misrepresent the intent.

Peer status raises a cost question the previous design did not answer: shop
rent, electricity and the shared bike belong to neither unit. Forcing them onto
one unit distorts its profit; leaving `business_unit_id` null makes them
disappear from both.

## Decision

1. `business_unit` holds three peer rows: `PARTS`, `REPAIR`, `SHARED`.
   `SHARED` carries `is_overhead = 1`.
2. Overhead expenses are recorded against `SHARED`. They are **allocated at
   report time**, never split on write.
3. Allocation method is a property of the expense category:
   `direct`, `shared_revenue`, `shared_fixed`, `not_expense`.
4. Two margin figures are reported: **direct margin** (fact) and **net margin**
   (estimate, after allocation). Direct margin is primary.

## Reasoning

Allocating on write would freeze the policy into historical data. Owners change
their minds about how rent should be split; recomputing at report time makes
that a settings change rather than a data migration.

Labelling net margin as an estimate matters because allocation is a judgement,
not a measurement. Presenting it as fact would give the owner false confidence
in a number that moves when he changes a percentage.

Owner drawings are excluded from expenses entirely (`not_expense`). Counting
cash the owner takes from the till as a business cost understates real profit —
a common and consequential error in small-business bookkeeping.

## Consequences

- A third `business_unit` row exists that has neither stock nor labour income.
  Reports must exclude `is_overhead = 1` from unit-versus-unit comparisons.
- The owner must set an allocation method per expense category during setup.
  Sensible defaults are seeded; he can override.
- Open question: whether Repair should also carry a cost of goods for parts it
  consumes (an internal transfer price). Currently it does not — the parts
  margin lands entirely in Spare Parts (ADR-0005). Revisit only if the owner
  asks for it explicitly.
