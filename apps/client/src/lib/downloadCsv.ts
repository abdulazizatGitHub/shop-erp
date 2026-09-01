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
