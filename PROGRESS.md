# PROGRESS.md — Session Log

> Append a new entry at the **end of every session**. Never edit past entries.
> Newest entry at the top.

---

## Entry template

```
## [YYYY-MM-DD] Session N — Phase X: [Phase name]

**Goal:** What this session set out to do.

**Done:**
- [file/module] — what changed and why

**Verified:**
- [what was tested] — [actual output / result, pasted]

**Not done / deferred:**
- [item] — [reason]

**Bugs found:** BUG-N (see PROJECT.md) | none

**Decisions taken:** ADR-N | none

**Blocked on:** [question / dependency] | nothing

**Next session should:** [precise first action]

**Checklist:**
- [ ] All verification checks passed
- [ ] No unresolved bugs introduced by this phase
- [ ] PROJECT.md updated with new status
- [ ] PROGRESS.md updated with session entry
- [ ] Next phase prerequisites are met
- [ ] Any new bugs documented in PROJECT.md
- [ ] Test suite passing (if project has tests)
```

---

## [2026-08-10] Session 3 — Phase 0: architecture determined, BUG-2 resolved

**Goal:** Determine whether `apps/server`/`apps/client` is really an Electron
main/renderer split (code correct, docs stale) or a real client/server-over-
HTTP architecture (undocumented, unapproved divergence) — the question BUG-2
left open. Owner had already confirmed my prior structural findings were
accurate, not confabulated, and downgraded BUG-2 from "possible
confabulation" to "docs vs. code disagree, need to determine which is right."

**Done:**

- Ran the determination: `cat` on all three `package.json` files, `ls -R` on
  all three `src` trees, `grep` for `BrowserWindow|contextBridge|ipcMain|
ipcRenderer` (zero matches) and separately for `express|fastify|
http.createServer|listen(` (zero matches) across `apps/` and `packages/`.
  Conclusion: no HTTP server exists or was ever wired; `apps/server`'s
  devDependencies (`electron`, `electron-vite`, `electron-builder`) only make
  sense as an Electron main process. Owner confirmed: code is right, docs are
  stale.
- `docs/SYSTEM_DESIGN.md` §1 (added a Directory column naming
  `apps/server`/`apps/client`), §2 (layers diagram), §5 (preload path) — `s/
apps\/desktop/apps\/server/`, `s/apps\/renderer/apps\/client/`
- `docs/ARCHITECTURE.md` — layers diagram (2 box-drawing lines, padding
  recomputed to preserve exact width) and module map tree
- `docs/CODING_STANDARDS.md` §7 — testing table, `apps/renderer` →
  `apps/client` (found this one myself; wasn't in the owner's original list)
- Checked `CLAUDE.md`, `README.md`, `docs/PROJECT_STRUCTURE.md` for the same
  staleness — all three were **already correct**, no edit needed.
  `PROJECT_STRUCTURE.md`'s dependency-direction table already matched the
  target direction the owner specified, cross-checked line-by-line against
  `eslint.config.js`'s actual enforced `no-restricted-imports` rules
- `eslint.config.js` boundary paths checked against real directories — already
  `apps/client`/`apps/server`, no stale `apps/renderer`/`apps/desktop`
  patterns to fix. Proved enforcement anyway: wrote a deliberate violating
  import (`apps/client` importing `@shop/db`), `npm run lint` correctly
  rejected it (`no-restricted-imports`), removed the test file, lint clean again
- `docs/decisions/ADR-0011-app-naming-and-contracts-package.md` — new;
  records `client`/`server`/`contracts` as the permanent names, that `server`
  is the Electron main process and not a network server, and that this
  supersedes the `desktop`/`renderer` naming in earlier docs
- `PROJECT.md` — added ADR-0011 to the decisions table; closed BUG-2 as
  RESOLVED (not renamed — documentation was stale, code was correct)
- `.vscode/settings.json` — added `"typescript.tsdk":
"node_modules/typescript/lib"` to pin the editor to the workspace
  TypeScript (5.9.3) instead of VS Code's bundled version, which was the
  likely cause of the owner's editor showing a `baseUrl` deprecation error
  that the terminal did not. Required a `.gitignore` exception
  (`!.vscode/settings.json`) since `.vscode/*` was ignored by design; asked
  before adding it since it changes repo policy, not just adds a file
- Researched (did not act on) the owner's judgement-call question: cost of
  renaming `apps/server` → `apps/main`. Fresh `grep` at time of asking: 8
  files / 24 references would need editing (`docs/PROJECT_STRUCTURE.md` 9,
  `CLAUDE.md` 4, `docs/SYSTEM_DESIGN.md` 3, `docs/ARCHITECTURE.md` 2,
  `eslint.config.js` 2, root `package.json` 2, `apps/server/package.json` 1,
  `README.md` 1), plus the directory move and `@shop/server`→`@shop/main`
  package rename. `PROGRESS.md` (4 refs) and `ADR-0011` (6 refs) excluded —
  historical record, not edited on rename. Zero build-tool hardcoding: no
  `electron.vite.config.ts` or `electron-builder.yml` exists yet to reference
  the name.

**Verified:**

- `grep` for stale naming in the three fixed docs — zero matches, pasted
- `npm run format:check` — exit 0 after each edit round
- `npm run verify` — exit 0, multiple times, pasted
- Boundary enforcement — deliberate violation created, lint error shown,
  violation removed, lint clean again — all pasted
- Box-drawing width preservation in `ARCHITECTURE.md` — computed via a
  Node one-liner comparing exact character lengths before writing, not
  guessed

**Not done / deferred:** P0-7 — owner said it starts "next session once this
is settled." The `apps/server`→`apps/main` rename itself: reported cost,
owner has not decided.

**Bugs found:** none new. BUG-2 resolved (see `PROJECT.md`).

**Decisions taken:** ADR-0011.

**Blocked on:** Owner's decision on `apps/server`→`apps/main`; Q1–Q5, Q7,
Q8, Q11 in `PROJECT.md`.

**Next session should:** If the owner has decided on the `apps/server`→
`apps/main` question, apply it first (8 files, 24 references, per the list
above) — then start P0-7 (`packages/db/src/migrate.ts`,
`packages/db/src/reset.ts`). If undecided, start P0-7 directly against the
current `apps/server` name.

**Checklist:**

- [x] All verification checks passed
- [x] No unresolved bugs introduced by this session's own changes
- [x] PROJECT.md updated with new status
- [x] PROGRESS.md updated with session entry
- [ ] Next phase prerequisites are met — P0-7 still not started (by design;
      owner said to stop here)
- [x] Any new bugs documented in PROJECT.md — none new; BUG-2 closed
- [x] Test suite passing (`npm run verify` exit 0)

---

## [2026-08-10] Session 2 — Phase 0: bug fixes, structural discrepancy raised

**Goal:** Close BUG-3 and BUG-4 with owner-approved fixes; investigate a
structural discrepancy the owner raised between what they authored
(`apps/desktop`, `apps/renderer`, `@shop/desktop`) and what's on disk
(`apps/client`, `apps/server`, `packages/contracts`).

**Done:**

- `eslint.config.js` — added `'coverage'` to `ignores` (closes BUG-3)
- `.gitattributes` — added at repo root, pinning LF line endings (closes BUG-4)
- `tsconfig.json` — removed deprecated `baseUrl`, prefixed all `paths` entries
  with `./` (paths have resolved relative to the tsconfig location since TS 4.4)
- Corrected prior session's error: `@eslint/js` is a genuine dependency of
  `eslint` itself and was never a real problem — not logged as a bug, per
  owner correction
- Investigated the structural discrepancy: ran `ls -la apps/ packages/`,
  `cat package.json`, `git log --oneline`, `git log --diff-filter=R
--name-status --oneline`, `git show 787c8cd --stat`, all pasted raw.
  Conclusion: `apps/client`, `apps/server`, `packages/contracts` were already
  on disk before `git init` ran in Session 1 (this repo had no git history
  before Session 1); `787c8cd` is the repo's root commit; zero renames exist
  in git history. I did not create, rename, or move these directories.
  Escalated as BUG-2 (CRITICAL, BLOCKING) — see `PROJECT.md` §3.

**Verified:**

- `npm run lint` — exit 0, both before removing the disposable `coverage/`
  dir (proving the fix works) and after
- `.gitattributes` renormalize — `git add --renormalize .` found nothing to
  change (blobs were already LF); re-ran the bad-commit-message test,
  `pre-commit` and `commit-msg` both fired identically to Session 1
- `npm run typecheck` — exit 0 after `baseUrl` removal
- `npm run verify` — exit 0
- Hook scripts (`​.husky/pre-commit`, `.husky/commit-msg`) confirmed LF at
  the byte level via direct Node buffer read

**Not done / deferred:** P0-7 — explicitly blocked by the owner until BUG-2
is resolved. Did not rename, move, or restructure anything in `apps/` or
`packages/`.

**Bugs found:** BUG-2 escalated to CRITICAL/BLOCKING (structural
discrepancy). BUG-3 and BUG-4 fixed and closed.

**Decisions taken:** none — owner explicitly has not decided how to resolve
BUG-2 yet.

**Blocked on:** BUG-2 (owner investigating on their end how `apps/client`,
`apps/server`, `packages/contracts` came to exist under those names); Q1–Q5,
Q7, Q8, Q11 in PROJECT.md.

**Next session should:** Wait for the owner's decision on BUG-2 before
touching P0-7 or anything in `apps/`/`packages/`.

**Checklist:**

- [x] All verification checks passed
- [x] No unresolved bugs introduced by this session's own changes
- [x] PROJECT.md updated with new status
- [x] PROGRESS.md updated with session entry
- [ ] Next phase prerequisites are met — blocked on BUG-2
- [x] Any new bugs documented in PROJECT.md
- [x] Test suite passing (`npm run verify` exit 0)

---

## [2026-08-09] Session 1 — Phase 0: P0-1 through P0-6

**Goal:** Get through as much of Phase 0 (P0-1–P0-11) as could be properly
verified in one session, per corrected sequencing: install → typecheck →
lint/format → baseline commit → bad-commit-message test → vitest → shared
package tests.

**Done:**

- `git init`; baseline commit `chore: initial scaffold` (100 files)
- `npm install` — 823 packages, all 7 workspaces (`client`, `server`,
  `contracts`, `core`, `db`, `shared`, `ui`) linked correctly
- `packages/db/package.json` — added `@types/better-sqlite3@^9.6.0` devDependency
  (connection.ts imported `better-sqlite3` with no types; typecheck failed
  without it)
- `packages/shared/src/money.ts`, `quantity.ts` — rewrote `negate()` to use
  the existing `subtract(ZERO, x)` instead of unary `-x`, per user decision,
  to satisfy `@typescript-eslint/no-unsafe-unary-minus` on the branded
  `Paisa`/`Milli` types
- `npm run format` — repo-wide Prettier pass (34 files, all pre-existing,
  never formatted since Session 0)
- `packages/db/src/migrations/README.md` — fixed stale "two SQL files" line
  (there are three; `0003_shared_overhead.sql` was undocumented)
- `packages/shared/src/id.test.ts` — new; covers `newId`, `isId`,
  `formatDocNumber` (P0-6 had no Id tests at all)
- `packages/shared/src/money.test.ts` — added tests to close `money.ts` and
  `quantity.ts` to 100% statement/branch/function/line coverage (was 77.77%
  / 58.13%); also added a smoke test for the `index.ts` barrel

**Verified:**

- `npm install` — clean, pasted in full
- `npm run typecheck` — exit 0
- `npm run lint` — exit 0 (confirmed via explicit `echo $?`)
- `npm run format:check` — exit 0
- Baseline commit — pre-commit (lint-staged + typecheck) and commit-msg
  (commitlint) both ran and passed on a real commit
- Bad-commit-message test — commit with message `"bad commit message"`
  rejected by commitlint (`subject-empty`, `type-empty`), `husky - commit-msg
script failed (code 1)`, exit 1, no commit created; pre-commit had already
  completed successfully beforehand, isolating which hook fired
- `npm test` — 9 passing (Session 0 baseline), then 33 passing after this
  session's additions
- `npm run test:coverage` — `packages/shared/src` (`id.ts`, `index.ts`,
  `money.ts`, `quantity.ts`) at 100% stmts/branch/func/line, pasted in full
- `npm run verify` — exit 0

**Not done / deferred:** P0-7 (migration runner) through P0-11 (Windows
installer) — not started, per session scope (P0-1–P0-6 only).

**Bugs found:**

- BUG-1 (LOW) — `db:migrate`/`db:reset` scripts reference files that don't
  exist yet (expected; they're built in P0-7)
- BUG-2 (LOW) — `docs/SYSTEM_DESIGN.md` names `apps/desktop`, which doesn't
  exist; real directories are `apps/server`/`apps/client`
- BUG-3 (LOW) — `eslint.config.js` doesn't ignore the generated `coverage/`
  directory, unlike `.gitignore`; `npm run lint` fails if `coverage/` exists
  on disk from a prior `test:coverage` run
- BUG-4 (MEDIUM) — no `.gitattributes`; this machine's system-wide
  `core.autocrlf=true` reintroduces CRLF on checkout, breaking
  `format:check` on files nobody actually edited (`git diff` shows nothing).
  Found while cleaning up the P0-4 throwaway commit test: `git checkout --
README.md` alone was enough to trigger it.

See `PROJECT.md` §3 for full bug entries.

**Decisions taken:** none new (used existing negate-via-subtract pattern,
user's explicit choice, not a new ADR)

**Blocked on:** Q1–Q5, Q7, Q8, Q11 in PROJECT.md (Q11 added this session —
P0-8's "table count matches expected" has no number yet)

**Next session should:** Start P0-7 — build `packages/db/src/migrate.ts` and
`packages/db/src/reset.ts` (the migration runner), which will also resolve
BUG-1. Before that, get a decision from the user on BUG-3 (permission to add
`'coverage'` to `eslint.config.js`'s `ignores` array) and BUG-4 (permission to
add a `.gitattributes` file) since both will keep resurfacing otherwise.

**Checklist:**

- [x] All verification checks passed
- [x] No unresolved bugs introduced by this phase (3 pre-existing/scaffold
      gaps found and documented, none newly introduced by this session's own
      changes)
- [x] PROJECT.md updated with new status
- [x] PROGRESS.md updated with session entry
- [ ] Next phase prerequisites are met — P0-7 not started
- [x] Any new bugs documented in PROJECT.md
- [x] Test suite passing (`npm run verify` exit 0)

---

## [2026-08-08] Session 0 — Phase 0 preparation

**Goal:** Establish project context, rules, and the Phase 0 scaffold.

**Done:**

- `CLAUDE.md` — operating rules, technical non-negotiables, architecture
- `PROJECT.md` — status, open questions, decisions, risks
- `PROGRESS.md` — this log
- `docs/PHASES.md` — phase plan with exit criteria
- `docs/` — architecture, coding standards, database rules, security
- `docs/decisions/` — ADR 0001–0009
- Repo scaffold: workspaces, TS config, lint, format, husky, commitlint, CI

**Verified:** Scaffold files created. Nothing executable yet.

**Not done:** Repo not initialised; dependencies not installed.

**Bugs found:** none

**Blocked on:** Q1–Q5, Q7, Q8 in PROJECT.md

**Next session should:** Run Phase 0 task P0-1 (`git init` + install dependencies)
from `docs/PHASES.md`.
