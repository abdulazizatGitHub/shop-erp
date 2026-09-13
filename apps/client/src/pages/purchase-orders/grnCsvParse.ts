/**
 * Mirrors packages/core/src/grn/grn-csv-import.ts's GRN_CSV_COLUMNS and
 * parseGrnCsv exactly. apps/client may never import @shop/core
 * (architecture boundary — eslint.config.js), so this is a manually
 * synced local copy — the same pattern useImportItemsFlow.ts's
 * ITEM_COLUMNS already uses. Only splits the file into rows; no business
 * validation happens here (that's grn:csvDryRun, server-side, the single
 * source of truth for accept/reject).
 */
export const GRN_CSV_COLUMNS = [
  'Item Code',
  'Qty Received',
  'Unit Cost (Rs)',
  'Selling Price (Rs)',
  'Wholesale Price (Rs)',
  'Notes',
];

export interface ParsedGrnCsvRow {
  readonly rowNumber: number;
  readonly cells: Record<string, string>;
}

export type ParseGrnCsvResult =
  | { readonly ok: true; readonly rows: readonly ParsedGrnCsvRow[] }
  | { readonly ok: false; readonly fileError: string };

/** Same quote-aware comma split as packages/core/src/import/csv.ts's parseCsvLine. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === undefined) continue;
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

export function parseGrnCsv(text: string): ParseGrnCsvResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { ok: false, fileError: 'The file is empty.' };
  }

  const headerCells = parseCsvLine(lines[0] ?? '').map((h) => h.trim());
  const headerMatches =
    headerCells.length === GRN_CSV_COLUMNS.length &&
    headerCells.every((h, i) => h === GRN_CSV_COLUMNS[i]);
  if (!headerMatches) {
    return {
      ok: false,
      fileError: `Header row must be exactly: ${GRN_CSV_COLUMNS.join(', ')}`,
    };
  }

  const dataLines = lines.slice(1);
  if (dataLines.length === 0) {
    return { ok: false, fileError: 'The file has no data rows.' };
  }

  const rows: ParsedGrnCsvRow[] = dataLines.map((line, index) => {
    const values = parseCsvLine(line);
    const cells: Record<string, string> = {};
    GRN_CSV_COLUMNS.forEach((header, i) => {
      cells[header] = (values[i] ?? '').trim();
    });
    return { rowNumber: index + 1, cells };
  });

  return { ok: true, rows };
}
