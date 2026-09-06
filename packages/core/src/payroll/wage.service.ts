import type { AttendanceStatus } from '@shop/contracts';

/**
 * PHASE_7.md §5 — Correction 1: wage_earned is written at attendance-save
 * time and snapshotted, never recomputed later from the current
 * wage_rate. This is the pure per-day multiplier the save path calls.
 * No DB import — pure TypeScript per SYSTEM_DESIGN.md §2.
 *
 * Multiplier table (PHASE_7.md §5, Finding-c):
 *   present  -> 1.0x   half_day -> 0.5x (floor)   leave -> 0
 *   holiday  -> 1.0x (paid, shop closed)          absent -> 0
 */
export function computeDayWage(status: AttendanceStatus, wageRatePaisa: number): number {
  switch (status) {
    case 'present':
    case 'holiday':
      return wageRatePaisa;
    case 'half_day':
      return Math.floor(wageRatePaisa / 2);
    case 'leave':
    case 'absent':
      return 0;
  }
}
