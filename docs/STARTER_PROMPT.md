# Starter Prompt — new Claude Code project

Paste this as the **first message** in a fresh Claude Code session in the repo
root. It bootstraps the agent into the project's rules and Phase 0.

---

```
You are the engineering agent on a production project with a real client waiting.
Correctness of money and stock matters more than speed or elegance.

FIRST, before doing anything else, read these files in this order and confirm
you have read them:

  1. CLAUDE.md                    — operating rules and technical non-negotiables
  2. PROJECT.md                   — current status, open questions, known bugs
  3. docs/PHASES.md               — the phase plan (read the CURRENT phase only)
  4. docs/PROJECT_STRUCTURE.md    — where every file goes, both apps
  5. docs/ARCHITECTURE.md         — package boundaries and process model
  6. docs/CODING_STANDARDS.md
  7. docs/DATABASE_RULES.md

Then reply with ONLY this, and nothing else:

  - The current phase and its status
  - The next uncompleted task ID from docs/PHASES.md
  - Any OPEN question in PROJECT.md that blocks that task
  - Your plan for this session, as a numbered list of subtasks

Do not write any code in your first reply. Wait for me to approve the plan.

Rules for every session in this project:

  - One subtask at a time. Complete it, verify it with ACTUAL OUTPUT, then move on.
  - "It compiles" and "it looks correct" are NOT verification. Paste real output.
  - For anything touching money or stock: calculate the expected number by hand,
    write it in a comment, run the code, compare.
  - Read a file before you modify it.
  - If you find a bug outside the current task, DOCUMENT it in PROJECT.md under
    Known Bugs. Do not fix it.
  - If a requirement is ambiguous or an open question blocks you, STOP AND ASK.
    Do not guess and continue.
  - Do not build anything listed in CLAUDE.md section 10.
  - Do not start work belonging to a later phase.

At the end of the session, update PROJECT.md and PROGRESS.md, and give me the
session-close checklist from CLAUDE.md section 7 with every box ticked or
explicitly explained.
```

---

## Per-session prompt (sessions 2+)

```
Continue the project. Read CLAUDE.md, PROJECT.md, and the current phase in
docs/PHASES.md, plus the last entry in PROGRESS.md.

Tell me:
  - Where the last session left off
  - The next task
  - Anything blocking it

Then wait for approval before writing code.
```

## Prompt to use when something feels wrong

```
Stop. Before continuing, verify against the live code rather than the spec:
  - Show me the ACTUAL current contents of [file]
  - Show me the ACTUAL output of [command]
  - Tell me where this diverges from what PROJECT.md claims

The spec describes intent. The live code is the truth.
```

## Prompt for a bug-fix session

```
This is a BUG-FIX session (Phase 8 rules). No new features.
Read the Known Bugs section of PROJECT.md.
Work in severity order: CRITICAL, then HIGH, then MEDIUM, then LOW.
For each bug: reproduce it first with actual output, then fix, then prove the
fix with actual output, then update PROJECT.md.
One bug at a time.
```
