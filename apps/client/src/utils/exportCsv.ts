/**
 * P10-5 — CSV export. buildCsvString is pure (no DOM calls) so its
 * string-building logic can be unit-tested directly; downloadCsv wraps
 * it with the actual Blob/anchor-click DOM work, kept as a separate,
 * clearly separated final step.
 */

const NEEDS_QUOTING = /[",\r\n]/;

function csvField(value: string | number): string {
  const str = String(value);
  if (!NEEDS_QUOTING.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

/** Builds the CSV string only. No DOM access — safe to unit-test directly. */
export function buildCsvString(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return '';

  const firstRow = rows[0];
  if (!firstRow) return '';
  const headers = Object.keys(firstRow);

  const lines = [
    headers.map(csvField).join(','),
    ...rows.map((row) => headers.map((header) => csvField(row[header] ?? '')).join(',')),
  ];

  return lines.join('\r\n');
}

/**
 * Builds the CSV string, then triggers a browser download via a
 * temporary Blob + anchor click. Does nothing on an empty rows array —
 * no DOM is touched in that case.
 */
export function downloadCsv(filename: string, rows: Record<string, string | number>[]): void {
  if (rows.length === 0) return;

  const csv = buildCsvString(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
