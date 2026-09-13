// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildCsvString, downloadCsv } from './exportCsv.js';

describe('buildCsvString (P10-5)', () => {
  it('builds a basic CSV with headers derived from the first row', () => {
    const result = buildCsvString([{ Name: 'Compressor', Qty: 5 }]);
    expect(result).toBe('Name,Qty\r\nCompressor,5');
  });

  it('quotes a field containing a comma', () => {
    const result = buildCsvString([{ Name: 'Gas, R-134a', Amount: '1500.00' }]);
    expect(result).toBe('Name,Amount\r\n"Gas, R-134a",1500.00');
  });

  it('quotes a field containing a double-quote, escaping it as two double-quotes', () => {
    const result = buildCsvString([{ Note: 'He said "hello"', Val: 1 }]);
    expect(result).toBe('Note,Val\r\n"He said ""hello""",1');
  });

  it('returns an empty string for zero rows', () => {
    expect(buildCsvString([])).toBe('');
  });

  it('builds multiple rows in order', () => {
    const result = buildCsvString([
      { Item: 'A', Total: '100.00' },
      { Item: 'B', Total: '200.00' },
    ]);
    expect(result).toBe('Item,Total\r\nA,100.00\r\nB,200.00');
  });

  it('quotes a field containing a CRLF', () => {
    const result = buildCsvString([{ Note: 'line1\r\nline2', Val: 1 }]);
    expect(result).toBe('Note,Val\r\n"line1\r\nline2",1');
  });
});

describe('downloadCsv (P10-5)', () => {
  it('returns immediately without touching the DOM when rows is empty', () => {
    const createElementSpy = vi.spyOn(document, 'createElement');

    downloadCsv('empty.csv', []);

    expect(createElementSpy).not.toHaveBeenCalled();
    createElementSpy.mockRestore();
  });
});
