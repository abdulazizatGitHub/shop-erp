// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/ipc.js', () => ({
  ipc: {
    staff: {
      listStaff: vi.fn(),
      getMonthAttendance: vi.fn(),
      saveAttendance: vi.fn(),
    },
  },
}));

import type { StaffDto } from '@shop/contracts';
import { ipc } from '../../lib/ipc.js';
import { AttendancePage } from './AttendancePage.js';

const listStaff = vi.mocked(ipc.staff.listStaff);
const getMonthAttendance = vi.mocked(ipc.staff.getMonthAttendance);

const STAFF: readonly StaffDto[] = [
  {
    id: 's1',
    name: 'Naeem',
    phone: '0300',
    staffRole: 'technician',
    wageRatePaisa: 60000,
    commissionBp: 1000,
    partyCode: 'STF-0001',
    createdAt: '2026-01-01',
  },
  {
    id: 's2',
    name: 'Rashid',
    phone: '0301',
    staffRole: 'salesman',
    wageRatePaisa: 50000,
    commissionBp: 0,
    partyCode: 'STF-0002',
    createdAt: '2026-01-01',
  },
  {
    id: 's3',
    name: 'Kamran',
    phone: '0302',
    staffRole: 'helper',
    wageRatePaisa: 40000,
    commissionBp: 0,
    partyCode: 'STF-0003',
    createdAt: '2026-01-01',
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AttendancePage (P7-8 smoke test, EC-P7-8)', () => {
  it('renders one row per staff member and one column per day of the month, with no attendance loaded', async () => {
    listStaff.mockResolvedValue(STAFF);
    getMonthAttendance.mockResolvedValue([]);

    render(<AttendancePage />);

    expect(await screen.findByText('Naeem')).toBeTruthy();
    expect(screen.getByText('Rashid')).toBeTruthy();
    expect(screen.getByText('Kamran')).toBeTruthy();
  });

  it('cycles a cell through present -> half_day -> absent -> leave -> holiday -> blank on click', async () => {
    listStaff.mockResolvedValue(STAFF);
    getMonthAttendance.mockResolvedValue([]);

    render(<AttendancePage />);
    await screen.findByText('Naeem');

    const cell = screen.getByLabelText('Naeem — day 1');
    expect(cell.textContent).toBe('');

    fireEvent.click(cell);
    expect(screen.getByLabelText('Naeem — day 1 — present').textContent).toBe('P');

    fireEvent.click(screen.getByLabelText('Naeem — day 1 — present'));
    expect(screen.getByLabelText('Naeem — day 1 — half_day').textContent).toBe('H');

    fireEvent.click(screen.getByLabelText('Naeem — day 1 — half_day'));
    expect(screen.getByLabelText('Naeem — day 1 — absent').textContent).toBe('A');

    fireEvent.click(screen.getByLabelText('Naeem — day 1 — absent'));
    expect(screen.getByLabelText('Naeem — day 1 — leave').textContent).toBe('L');

    fireEvent.click(screen.getByLabelText('Naeem — day 1 — leave'));
    expect(screen.getByLabelText('Naeem — day 1 — holiday').textContent).toBe('Ho');

    fireEvent.click(screen.getByLabelText('Naeem — day 1 — holiday'));
    expect(screen.getByLabelText('Naeem — day 1').textContent).toBe('');
  });

  it('Save changes is disabled until a cell changes, then enabled', async () => {
    listStaff.mockResolvedValue(STAFF);
    getMonthAttendance.mockResolvedValue([]);

    render(<AttendancePage />);
    await screen.findByText('Naeem');

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    expect(saveButton.getAttribute('disabled')).not.toBeNull();

    fireEvent.click(screen.getByLabelText('Naeem — day 1'));

    expect(saveButton.getAttribute('disabled')).toBeNull();
  });

  it('shows an empty state with no staff', async () => {
    listStaff.mockResolvedValue([]);
    getMonthAttendance.mockResolvedValue([]);

    render(<AttendancePage />);

    expect(await screen.findByText('No staff yet.')).toBeTruthy();
    expect(screen.getByText('Add a staff member from the Staff tab first.')).toBeTruthy();
  });
});
