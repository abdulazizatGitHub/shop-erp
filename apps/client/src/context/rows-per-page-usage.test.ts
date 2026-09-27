import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const clientSrc = path.join(import.meta.dirname, '..');

// P17-3 (docs/phases/PHASE_17.md §2.5, §8): "each of the 11 files uses
// the hook, not a local constant" is a static fact about the source,
// not a runtime behavior any render test can observe (a component using
// a hardcoded 10 renders identically to one reading a default-10 hook).
// Grepping the actual file text is the only direct way to prove it.
const FILES: readonly string[] = [
  'pages/reports/DailySalesReport.tsx',
  'pages/reports/CashBookReport.tsx',
  'pages/reports/BestPerformersTable.tsx',
  'pages/reports/ItemsSoldTable.tsx',
  'pages/reports/WageMonthReport.tsx',
  'pages/reports/ReceivablesAgingReport.tsx',
  'pages/reports/ExpensesReport.tsx',
  'pages/reports/JobSplitReport.tsx',
  'pages/reports/StockValuationReport.tsx',
  'pages/jobs/JobsPage.tsx',
  'pages/parties/CustomerLedgerTable.tsx',
];

describe('all 11 rows-per-page tables use the shared hook (P17-3)', () => {
  it.each(FILES)(
    '%s imports and calls useRowsPerPage(), no local ROWS_PER_PAGE constant',
    (relativePath) => {
      const source = readFileSync(path.join(clientSrc, relativePath), 'utf8');

      expect(source).toMatch(/useRowsPerPage/);
      expect(source).not.toMatch(/const\s+ROWS_PER_PAGE\s*=/);
    },
  );
});
