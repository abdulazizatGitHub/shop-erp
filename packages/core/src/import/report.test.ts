import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';
import { ITEM_COLUMNS } from './item-columns.js';
import { validateItemRows, type ItemImportLookups } from './item-import.js';
import { formatItemImportReport } from './report.js';

const fixturePath = path.join(import.meta.dirname, '__fixtures__/items.csv');

describe('formatItemImportReport', () => {
  it('summarises the exact 4-accepted/4-rejected split from the fixture', () => {
    const lookups: ItemImportLookups = {
      businessUnitIdByCode: new Map([
        ['PARTS', 'bu-parts-id'],
        ['REPAIR', 'bu-repair-id'],
      ]),
      uomIdByName: new Map([
        ['kg', 'uom-kg-id'],
        ['cylinder', 'uom-cylinder-id'],
        ['piece', 'uom-piece-id'],
        ['foot', 'uom-foot-id'],
      ]),
      categoryIdByName: new Map(),
      brandIdByName: new Map(),
      existingItemCodes: new Set(),
      existingItemNames: new Set(),
    };
    const csvText = readFileSync(fixturePath, 'utf8');
    const { rows } = parseCsv(csvText, ITEM_COLUMNS);
    const results = validateItemRows(rows, lookups);

    const report = formatItemImportReport(results);

    expect(report).toContain('# 4 accepted, 4 rejected, 0 skipped');
    expect(report).toContain('Gas R-134a');
    // reasons containing " are CSV-escaped as "" — this is correctly
    // quoted CSV, not literal text, so match the escaped form
    expect(report).toContain('Category ""NonexistentCategory"" not found');
    expect(report).toContain('Item Code ""CU-PIPE-01"" already exists');
    // every fixture row appears exactly once
    expect(report.split('\n').filter((line) => /^\d+,/.exec(line))).toHaveLength(8);
  });

  it('quotes a reason containing a comma so the CSV stays well-formed', () => {
    const report = formatItemImportReport([
      { rowNumber: 2, status: 'rejected', reason: 'Bad, weird value' },
    ]);
    expect(report).toContain('"Bad, weird value"');
  });
});
