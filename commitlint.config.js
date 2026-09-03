export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        // @commitlint/config-conventional's default list — repeated
        // explicitly because this rule can only be overridden wholesale,
        // not appended to.
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
        // Standalone utility scripts (scripts/*.ts) — not app code, not a
        // fix/feat/chore of the app itself.
        'scripts',
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        'shared',
        'db',
        'core',
        'ui',
        'desktop',
        'renderer',
        'sale',
        'purchase',
        'stock',
        'party',
        'job',
        'expense',
        'report',
        'print',
        'import',
        'backup',
        'auth',
        'deps',
        'ci',
        'docs',
        // Domain scopes confirmed against real handler/page files
        // (apps/server/src/ipc/handlers/*, apps/client/src/pages/*):
        'item',
        'payment',
        'invoice',
        'settings',
        // Repo/tooling config itself (eslint.config.js, commitlint.config.js,
        // tsconfig.json, etc.) — added after this exact commit needed it.
        'config',
        // Phase markers (docs/phases/PHASE_N.md, phase-scoped work):
        'p5',
        'p6',
        'p7',
        'p8',
      ],
    ],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case']],
    'header-max-length': [2, 'always', 100],
  },
};
