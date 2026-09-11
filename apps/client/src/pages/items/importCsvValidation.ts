/** Shared by useImportItemsFlow and useImportOpeningStockFlow — same six-state
 * file-picker shape (see ImportFileChip/ImportFileState), different CSVs. */
export type ImportState =
  | { readonly status: 'idle' }
  | { readonly status: 'validating'; readonly filename: string }
  | {
      readonly status: 'ready';
      readonly filename: string;
      readonly rowCount: number;
      readonly text: string;
    }
  | { readonly status: 'error'; readonly filename: string; readonly errors: readonly string[] }
  | { readonly status: 'importing'; readonly filename: string; readonly text: string }
  | {
      readonly status: 'failed';
      readonly filename: string;
      readonly text: string;
      readonly serverError: string;
    };

/** First line only — a full parseCsv (quoted-cell-aware) lives in @shop/core, which
 * apps/client cannot import; header cells in these templates never contain commas. */
export function parseHeaderLine(text: string): string[] {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  return firstLine.split(',').map((cell) => cell.trim().replace(/^"(.*)"$/, '$1'));
}

export function countDataRows(text: string): number {
  return text.split(/\r?\n/).filter((line, index) => index > 0 && line.trim().length > 0).length;
}

export function validateHeaders(
  headers: readonly string[],
  requiredColumns: readonly string[],
): string[] {
  const errors: string[] = [];
  const missing = requiredColumns.filter((col) => !headers.includes(col));
  const extra = headers.filter((h) => h.length > 0 && !requiredColumns.includes(h));
  if (missing.length > 0) errors.push(`Missing columns: ${missing.join(', ')}`);
  if (extra.length > 0) errors.push(`Unexpected columns: ${extra.join(', ')}`);
  return errors;
}
