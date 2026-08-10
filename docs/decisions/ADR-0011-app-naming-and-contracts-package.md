# ADR-0011: `client`/`server`/`contracts` naming supersedes `desktop`/`renderer`

**Status:** Accepted · **Date:** 2026-08-10

## Context

Early design docs (`SYSTEM_DESIGN.md`, `ARCHITECTURE.md`, `CODING_STANDARDS.md`)
named the two Electron processes `apps/desktop` and `apps/renderer`. The repo
scaffold that was actually built uses `apps/server` and `apps/client`, plus a
`packages/contracts` package that the earlier design did not name at all.

This surfaced as a structural discrepancy during Phase 0 (`PROJECT.md` BUG-2):
the owner did not recognise the on-disk names as what they had authored, and
raised it as a possible unapproved architecture change. Investigation (raw
`ls`, `cat`, `git log --diff-filter=R`, `git show` on the repo's root commit)
found no rename in git history and no code implementing either an IPC or an
HTTP architecture — only dependency choices in `package.json` files. Those
were then read directly: `apps/server` carries `electron`, `electron-vite`,
`electron-builder` as devDependencies and packages via `electron-builder --win`;
`apps/client` carries `vite` and `react` with no HTTP client; `grep` across
`apps/` and `packages/` for `BrowserWindow`, `contextBridge`, `ipcMain`,
`ipcRenderer`, `express`, `fastify`, `http.createServer`, and `listen(` found
zero HTTP-server code and, at the time, zero Electron wiring either — the
scaffold is unimplemented, but the dependency graph is unambiguous: this is an
Electron main/renderer split, not a client/server-over-HTTP split. `server` here
means "the process that serves the application," not "a process reachable over
a network."

## Decision

1. The real, permanent names are:
   - `apps/server` — the Electron **main process**. The backend: owns the
     SQLite file, runs all business logic, IPC handlers, printing, backup,
     import. Not a network server; never listens on a port.
   - `apps/client` — the **renderer**. React UI, sandboxed
     (`nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`). No
     database, no filesystem, no Node APIs.
   - `packages/contracts` — Zod schemas and their inferred types, shared by
     both sides across the IPC boundary. Depends on nothing beyond `zod` and
     `@shop/shared`.
2. This supersedes every `apps/desktop` / `apps/renderer` reference in earlier
   docs. Per `CLAUDE.md` rule 6 ("the live code is the truth"), the code was
   correct and the docs were stale — not the other way around. No code, no
   directory, and no package was renamed to produce this decision.
3. Dependency direction (enforced by `eslint.config.js`, cross-checked against
   `docs/PROJECT_STRUCTURE.md`'s existing table, which already matched):

   ```
   client    -> contracts, shared, ui
   server    -> contracts, core, db, shared
   core      -> shared
   db        -> shared
   contracts -> shared
   ```

## Reasoning

`packages/contracts` holding the Zod schemas — rather than defining them
inside IPC handlers, as the original design did — is a genuine improvement,
not just a rename. Schemas defined inside `apps/server`'s handlers would have
their inferred TypeScript types trapped in a package `apps/client` cannot
import without pulling in Electron. Defining them once in a dependency-free
shared package, imported by both sides, is what makes a breaking contract
change a compile error in the renderer instead of a runtime surprise.

`electron-vite` for the build (rather than hand-configuring three separate
esbuild/Vite entry points for main, preload, and renderer) is also a real
improvement over the original design: it is the standard tool for exactly this
three-entry-point shape and removes hand-maintained build config that would
otherwise need to be kept in sync by hand.

## Consequences

- `docs/SYSTEM_DESIGN.md`, `docs/ARCHITECTURE.md`, and
  `docs/CODING_STANDARDS.md` were edited to use `apps/client`/`apps/server` in
  place of `apps/desktop`/`apps/renderer`. `CLAUDE.md`, `README.md`, and
  `docs/PROJECT_STRUCTURE.md` already used the correct names and needed no
  change.
- `PROJECT.md` BUG-2 is closed: resolution was "documentation was stale, code
  was correct," not a rename.
- `apps/server` remains the name despite reading as ambiguous next to "no HTTP
  server" (see the owner's open question in `PROJECT.md` about renaming it to
  `apps/main`). If that rename happens later, it is a separate, deliberate
  change — not implied by this ADR.
