# ADR-0001: TypeScript everywhere, no Python

**Status:** Accepted · **Date:** 2026-08-08

## Context

Original plan was Electron + "Python/Node" on the backend.

## Decision

TypeScript only. No Python in the shipped application.

## Reasoning

Two runtimes means two dependency trees, two toolchains, and two packaging
problems inside an Electron installer that must install cleanly on a
shopkeeper's Windows machine with no internet and no developer present.
Shared types between UI and backend are a significant correctness win for a
solo developer. Python's advantages (pandas, reporting) do not outweigh
doubling the distribution complexity.

## Consequences

- Reporting and Excel import use Node libraries (`exceljs`).
- If heavy analytics are ever needed, they run server-side in cloud mode, not on the client.
