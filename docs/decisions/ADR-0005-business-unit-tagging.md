# ADR-0005: Two business units separated by line-level tagging

**Status:** Accepted · **Date:** 2026-08-08

## Context

The client runs a spare parts shop and a repair shop. The repair shop consumes
parts from the parts shop. They want the two P&Ls kept strictly separate.

## Decision

Each invoice line is tagged with a `business_unit_id`. Parts lines carry parts
revenue and COGS; labour lines carry repair revenue. **No internal sale document
is created for billed work.**

An `internal_transfer` is created **only** when parts are consumed with no
customer invoice (free installation, warranty rework, shop's own use).

## Reasoning

The owner's actual question is "how much of this bill was parts and how much was
labour" — that is a line-level split of one invoice. Modelling it as two
businesses trading requires an internal transfer price, a policy the owner will
re-litigate monthly, and reconciliation work, to answer the same question.

## Consequences

- Parts margin lands in Spare Parts; labour margin lands in Repair.
- Unbilled consumption is the one case needing an internal transfer, valued at
  cost by default.
- Costs (`expense`, `purchase`, `stock_movement`) are tagged too, or unit P&L
  would be revenue-only.

## Alternatives rejected

- **Repair buys at cost and resells** — needs a transfer price and an
  intercompany module; answers no additional question.
