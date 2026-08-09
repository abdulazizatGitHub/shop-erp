# ADR-0006: Technician custody is a warehouse; shortages are noted, not deducted

**Status:** Accepted · **Date:** 2026-08-08

## Context

Technicians take gas, pipe and parts out to jobs. The client wants to know what
each technician is holding.

## Decision

Each technician is a `warehouse` with `warehouse_kind = 'technician'`. Material
moves Shop → Technician (transfer), then Technician → Job (`job_issue`). The
balance in a technician's warehouse is what he still holds.

Shortages are **recorded** in `custody_reconciliation` with `action_taken = 'noted'`
so the owner can ask about them. They are **never automatically deducted from
wages**. Deduction requires an explicit owner action.

## Reasoning

Custody (where is the stock) and liability (who owes money) are different
questions. Conflating them creates false debts. Auto-deducting a daily wager's
pay over half a kilo of gas would damage the working relationship and lead to
staff bypassing the system — which destroys the data the owner wanted.

Confirmed with the client 2026-08-08.

## Consequences

- Weekly reconciliation is a report and a conversation, not an automated posting.
- If the owner decides to deduct, that creates a `party_ledger` entry linked to
  the reconciliation record.
