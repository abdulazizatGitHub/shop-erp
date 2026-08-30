import { shell } from 'electron';

/**
 * P4-1c print mechanism.
 *
 * History:
 * - Originally PowerShell `Start-Process -Verb Print` via
 *   child_process.spawn (BUG-A fixed the $args[0] path-passing bug in
 *   that version, 2026-08-29).
 * - Switched to shell.openPath() 2026-08-30 after real-hardware
 *   testing hit the documented fallback scenario from PROJECT.md: the
 *   PowerShell path worked (the PDF was generated correctly — its path
 *   was visible in the resulting error message) but the shop PC's
 *   default PDF viewer (Edge) ignores the `Print` verb entirely, so
 *   nothing ever reached the printer.
 *
 * shell.openPath() is an Electron built-in — no new npm dependency.
 * It opens the PDF in the system's default viewer; the owner prints
 * from there (one click with a real printer connected; Windows offers
 * "Microsoft Print to PDF" as a fallback when none is). This resolves
 * with an empty string on success, or an error message string on
 * failure — it does not reject for an ordinary "couldn't open" case,
 * only for a genuine internal error.
 */
export type OpenPathFn = typeof shell.openPath;

export async function printFile(
  pdfPath: string,
  openPathFn: OpenPathFn = (path) => shell.openPath(path),
): Promise<void> {
  const error = await openPathFn(pdfPath);
  if (error) {
    throw new Error(`Print command failed: ${error}`);
  }
}
