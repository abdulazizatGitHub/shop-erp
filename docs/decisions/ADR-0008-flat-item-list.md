# ADR-0008: Flat item list, no product/variant matrix

**Status:** Accepted · **Date:** 2026-08-08

## Context

The shop stocks multiple gases (types × companies) and multiple compressors
(AC/fridge × capacity × company), suggesting a parent-product/variant model.

## Decision

A flat `item` table with `category`, `brand`, and a free-text `variant_label`.
No parent product, no attribute matrix, no generated SKU combinations.

## Reasoning

At 300–500 SKUs, category + brand provides all the grouping value in reports and
search. A variant matrix costs roughly a week of work, adds combinatorial
complexity to pricing, stock and purchasing, and buys nothing at this scale.

## Consequences

- Data entry writes each variant as its own row. Documented in the template guide.
- Revisit only above ~2,000 SKUs or if per-variant purchasing is needed.
