/** Client-side only — Blob + object URL, no filesystem/IPC access needed. */
export function downloadCsv(
  filename: string,
  headers: readonly string[],
  row: readonly string[],
): void {
  const csv = `${headers.join(',')}\n${row.join(',')}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * P9C. Additive sibling of downloadCsv — for templates pre-filled with more
 * than one data row (e.g. GRN CSV import's one-row-per-PO-line template).
 * downloadCsv's own signature/callers are untouched.
 */
export function downloadCsvRows(
  filename: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): void {
  const csv = `${headers.join(',')}\n${rows.map((row) => row.join(',')).join('\n')}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
