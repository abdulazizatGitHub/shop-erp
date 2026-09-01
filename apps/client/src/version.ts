/**
 * Kept in sync with this package's package.json "version" field by hand —
 * deliberately not read via IPC (no main-process round trip for a constant)
 * and not build-time-injected (no vite.config exists here yet; not worth
 * adding one for a single string).
 */
export const APP_VERSION = '0.1.0';
