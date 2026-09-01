import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Boundary rules enforce docs/PROJECT_STRUCTURE.md section 2. CI fails on violation. */
export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/out',
      '**/release',
      '**/node_modules',
      '**/coverage',
      '**/*.config.js',
      '**/*.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      'no-restricted-syntax': [
        'error',
        {
          // ADR-0003: money must never be a bare float variable
          selector: 'VariableDeclarator[id.name=/^(price|amount|total|cost|balance|subtotal)$/]',
          message: 'Money variables must end in "Paisa" (e.g. totalPaisa). See ADR-0003.',
        },
        { selector: 'TSEnumDeclaration', message: 'Use `as const` union types instead of enum.' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },

  // packages/shared — zero dependencies
  {
    files: ['packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@shop/*', 'electron', 'react', 'better-sqlite3', 'kysely', 'zod'] },
      ],
    },
  },

  // packages/contracts — shapes only
  {
    files: ['packages/contracts/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@shop/core', '@shop/db', '@shop/ui', 'electron', 'react'] },
      ],
    },
  },

  // packages/core — pure domain logic
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['electron', 'react', '@shop/ui', 'better-sqlite3', 'fs', 'path'],
          paths: [{ name: 'kysely', message: 'core must not know about the database driver.' }],
        },
      ],
    },
  },

  // packages/ui — presentation only, no domain knowledge
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@shop/core', '@shop/db', '@shop/contracts', 'electron'] },
      ],
    },
  },

  // packages/i18n — string dictionaries + a hook, no domain knowledge
  {
    files: ['packages/i18n/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@shop/core', '@shop/db', '@shop/contracts', '@shop/ui', 'electron'] },
      ],
    },
  },

  // apps/client — sandboxed browser context
  {
    files: ['apps/client/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@shop/db',
            '@shop/core',
            'electron',
            'better-sqlite3',
            'fs',
            'path',
            'child_process',
          ],
        },
      ],
    },
  },

  // apps/server — no UI
  {
    files: ['apps/server/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['react', 'react-dom', '@shop/ui'] }],
    },
  },
);
