import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface ReportPaths {
  readonly sourceReportPath: string | null;
  readonly logReportPath: string;
}

/**
 * Writes the report next to the source file (findable at a glance, when a
 * source file path is available) AND under the app's log directory
 * (guaranteed writable — the source may be a USB drive that gets
 * unplugged, or a folder the app can't write to, and since the Option B
 * IPC contract change the renderer sends file content rather than a path,
 * so there may be no source path at all). A failure writing the
 * source-adjacent copy is logged, not fatal — the log-dir copy is what
 * actually guarantees the report is never lost.
 */
export function writeReportDual(
  sourceFilePath: string | null,
  logDir: string,
  reportText: string,
  suffix: string,
): ReportPaths {
  let sourceReportPath: string | null = null;
  if (sourceFilePath) {
    sourceReportPath = `${sourceFilePath}.report.csv`;
    try {
      writeFileSync(sourceReportPath, reportText, 'utf8');
    } catch (error: unknown) {
      console.error('Could not write report next to source file:', error);
      sourceReportPath = null;
    }
  }

  mkdirSync(logDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logReportPath = path.join(logDir, `import-${suffix}-${stamp}.report.csv`);
  writeFileSync(logReportPath, reportText, 'utf8');

  return { sourceReportPath, logReportPath };
}
