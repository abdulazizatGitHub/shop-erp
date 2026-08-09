# ADR-0009: Permissions are code, not a metadata engine

**Status:** Accepted · **Date:** 2026-08-08

## Context

The long-term ambition is a system configurable for many business types,
including per-business actors, actions and permissions defined as data.

## Decision

Roles and permissions are defined in TypeScript. `user_permission_override`
stores per-user exceptions only. No metadata-driven permission engine.

## Reasoning

A configurable permission engine is a step toward a low-code platform — a
strictly harder problem than the ERP itself, and one that Odoo and Frappe have
each spent 15+ years on. Business variation is mostly variation in _logic_, not
structure, and logic cannot be configured without inventing a scripting layer.

For a solo developer with an AI assistant, generated abstractions are cheap to
write and expensive to understand at 11pm when a shop cannot bill. Comprehension
is the binding constraint, not typing speed.

## Consequences

- Adding a vertical costs 3–4 weeks of coding, not zero. Accepted.
- Revisit only after three real customers are live, per the phase plan.
