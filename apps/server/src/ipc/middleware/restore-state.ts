/**
 * Race guard for backup:restore (P4-4d). This app has no persistent
 * database connection to "close and reopen" — every handler opens its
 * own connection per call and closes it before returning (see
 * PROJECT.md BUG-15). The real risk during a restore is a DIFFERENT
 * handler's async call landing mid-flight while restoreBackup()'s file
 * copy overwrites the live .db file underneath it. This flag blocks
 * every withError-wrapped handler while a restore is in progress,
 * rather than trying to track or cancel in-flight connections.
 *
 * Known gap, not silently ignored: a few older handlers
 * (item:create/item:search/item:lookups, the import:* handlers) predate
 * withError and are not wrapped by it — see PHASE_3.5.md section 8's
 * pre-existing note. Those are not protected by this guard. Fixing that
 * means retrofitting withError onto them, a separate pre-existing gap,
 * not new scope for P4-4d.
 */
let restoring = false;

export function isRestoreInProgress(): boolean {
  return restoring;
}

export function setRestoreInProgress(value: boolean): void {
  restoring = value;
}
