/**
 * Identifiers. See ADR-0002 / CLAUDE.md 3.4.
 * UUIDv7 is time-sortable, which keeps index locality good and makes
 * future multi-device sync tractable. Never use AUTOINCREMENT.
 */
import { v7 as uuidv7 } from 'uuid';

export type Id = string & { readonly __brand: 'Id' };

export function newId(): Id {
  return uuidv7() as Id;
}

export function isId(value: unknown): value is Id {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

/**
 * Human-readable document number: INV-A-000123
 * The device code prevents collisions when a second machine is added.
 */
export function formatDocNumber(prefix: string, deviceCode: string, sequence: number): string {
  return `${prefix}-${deviceCode}-${String(sequence).padStart(6, '0')}`;
}

/**
 * Display document number: INV-0001 (ADR-0012). No device code — the
 * device_code column still exists on document_sequence for future
 * multi-device collision prevention, it just isn't shown. Pads to 4
 * digits minimum; a sequence of 10000 or more displays as-is.
 */
export function formatDisplayDocNumber(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}
