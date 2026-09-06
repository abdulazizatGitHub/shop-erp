import { describe, expect, it, vi } from 'vitest';
import { deriveBusinessUnitCode, saveAttendanceBatch } from './attendance.service.js';
import type {
  AttendanceRepositoryPort,
  SaveAttendanceBatchInput,
} from './attendance.repository.port.js';

describe('deriveBusinessUnitCode — PHASE_7.md §5 Correction C', () => {
  it('technician -> REPAIR', () => {
    expect(deriveBusinessUnitCode('technician')).toBe('REPAIR');
  });
  it('salesman -> PARTS', () => {
    expect(deriveBusinessUnitCode('salesman')).toBe('PARTS');
  });
  it('helper -> SHARED', () => {
    expect(deriveBusinessUnitCode('helper')).toBe('SHARED');
  });
  it('null -> SHARED', () => {
    expect(deriveBusinessUnitCode(null)).toBe('SHARED');
  });
});

describe('saveAttendanceBatch', () => {
  it('computes wage_earned and business_unit_code per row, then calls repo.saveBatch once', async () => {
    let captured: SaveAttendanceBatchInput | undefined;
    const saveBatch = vi.fn((input: SaveAttendanceBatchInput) => {
      captured = input;
      return Promise.resolve();
    });
    const getMonthAttendance = vi.fn(() => Promise.resolve([]));
    const repo: AttendanceRepositoryPort = { saveBatch, getMonthAttendance };

    await saveAttendanceBatch(repo, [
      {
        staffId: 'staff-1',
        date: '2026-08-01',
        status: 'present',
        wageRatePaisa: 60000,
        staffRole: 'technician',
      },
      {
        staffId: 'staff-2',
        date: '2026-08-01',
        status: 'half_day',
        wageRatePaisa: 50000,
        staffRole: 'salesman',
      },
      {
        staffId: 'staff-3',
        date: '2026-08-01',
        status: 'absent',
        wageRatePaisa: 40000,
        staffRole: 'helper',
      },
    ]);

    expect(saveBatch).toHaveBeenCalledTimes(1);
    expect(captured?.rows).toEqual([
      {
        staffId: 'staff-1',
        attendanceDate: '2026-08-01',
        status: 'present',
        wageEarnedPaisa: 60000,
        businessUnitCode: 'REPAIR',
      },
      {
        staffId: 'staff-2',
        attendanceDate: '2026-08-01',
        status: 'half_day',
        wageEarnedPaisa: 25000, // floor(50000 / 2)
        businessUnitCode: 'PARTS',
      },
      {
        staffId: 'staff-3',
        attendanceDate: '2026-08-01',
        status: 'absent',
        wageEarnedPaisa: 0,
        businessUnitCode: 'SHARED',
      },
    ]);
  });
});
