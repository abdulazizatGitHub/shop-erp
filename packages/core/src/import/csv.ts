/**
 * Minimal RFC4180-ish CSV parser. Pure (text in, rows out) — no fs. The
 * real .xlsx reader (deferred until the real template file exists) will
 * produce the same Record<string,string>[] shape, so parseRows below
 * doesn't care which one fed it.
 */
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

export interface ParsedCsvRow {
  readonly rowNumber: number;
  readonly cells: Record<string, string>;
}

export interface ParseCsvResult {
  readonly headers: readonly string[];
  readonly rows: readonly ParsedCsvRow[];
}

/**
 * Finds the header row by matching known column names, not a hardcoded
 * row number — the real template has title/help rows above the data and
 * a client may add or delete a blank row above it.
 */
export function parseCsv(text: string, expectedColumns: readonly string[]): ParseCsvResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

  let headerLineIndex = -1;
  let headers: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const candidate = parseCsvLine(lines[i] ?? '').map((h) => h.trim());
    const matchCount = expectedColumns.filter((col) => candidate.includes(col)).length;
    // Header row = the one matching most of the known columns. Requiring
    // a majority (not all) tolerates a template revision adding a column.
    if (matchCount >= Math.ceil(expectedColumns.length * 0.6)) {
      headerLineIndex = i;
      headers = candidate;
      break;
    }
  }

  if (headerLineIndex === -1) {
    throw new Error(
      `Could not find a header row matching the expected columns: ${expectedColumns.join(', ')}`,
    );
  }

  const rows: ParsedCsvRow[] = [];
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i] ?? '');
    const cells: Record<string, string> = {};
    headers.forEach((header, index) => {
      cells[header] = (values[index] ?? '').trim();
    });
    rows.push({ rowNumber: i + 1, cells });
  }

  return { headers, rows };
}
