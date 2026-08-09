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
