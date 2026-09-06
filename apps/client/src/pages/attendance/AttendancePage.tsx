import { useEffect, useMemo, useState } from 'react';
import type { AttendanceStatus, StaffDto } from '@shop/contracts';
import { Alert, Button, EmptyState, LoadingState, PageHeader, Select } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

// blank -> present -> half_day -> absent -> leave -> holiday -> blank
const CYCLE: readonly (AttendanceStatus | null)[] = [
  null,
  'present',
  'half_day',
  'absent',
  'leave',
  'holiday',
];

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'P',
  half_day: 'H',
  absent: 'A',
  leave: 'L',
  holiday: 'Ho',
};

const STATUS_CLASSES: Record<AttendanceStatus, string> = {
  present: 'bg-money-in/20 text-money-in',
  half_day: 'bg-amber-200 text-amber-900',
  absent: 'bg-danger-subtle text-danger',
  leave: 'bg-surface-sunken text-ink-muted',
  holiday: 'bg-purple-200 text-purple-900',
};

function nextStatus(current: AttendanceStatus | null): AttendanceStatus | null {
  const index = CYCLE.indexOf(current);
  return CYCLE[(index + 1) % CYCLE.length] ?? null;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function dateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** staffId -> date ('YYYY-MM-DD') -> status|null */
type Grid = Record<string, Record<string, AttendanceStatus | null>>;

function buildGridFromServer(
  staffList: readonly StaffDto[],
  records: readonly { staffId: string; attendanceDate: string; status: AttendanceStatus }[],
): Grid {
  const grid: Grid = {};
  for (const staff of staffList) {
    grid[staff.id] = {};
  }
  for (const record of records) {
    (grid[record.staffId] ??= {})[record.attendanceDate] = record.status;
  }
  return grid;
}

/**
 * P7-8 — a new top-level page/tab, not a third section bolted onto
 * StaffPage.tsx (which already covers roster + advances) — an
 * interactive month grid with cycling cells and dirty-state tracking
 * deserves its own screen, same reasoning Dashboard/Expenses got their
 * own tabs rather than being appended to an existing page.
 *
 * Arrow-key cell-to-cell navigation was NOT implemented — it would need
 * a 2D grid of refs and manual .focus() calls; native Tab order between
 * <button> cells already covers keyboard traversal without that
 * complexity, so this is a deliberate scope cut, not an oversight.
 */
export function AttendancePage(): React.JSX.Element {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [staffList, setStaffList] = useState<readonly StaffDto[] | null>(null);
  const [savedGrid, setSavedGrid] = useState<Grid>({});
  const [grid, setGrid] = useState<Grid>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setError(null);
    setMessage(null);
    Promise.all([ipc.staff.listStaff(), ipc.staff.getMonthAttendance({ year, month })])
      .then(([staff, records]) => {
        setStaffList(staff);
        const loaded = buildGridFromServer(staff, records);
        setSavedGrid(loaded);
        setGrid(loaded);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load attendance');
      });
  }, [year, month]);

  const days = useMemo(() => {
    const count = daysInMonth(year, month);
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [year, month]);

  const isDirty = useMemo(() => {
    if (!staffList) return false;
    for (const staff of staffList) {
      for (const day of days) {
        const key = dateKey(year, month, day);
        if ((grid[staff.id]?.[key] ?? null) !== (savedGrid[staff.id]?.[key] ?? null)) {
          return true;
        }
      }
    }
    return false;
  }, [grid, savedGrid, staffList, days, year, month]);

  function cycleCell(staffId: string, key: string): void {
    setMessage(null);
    setGrid((prev) => {
      const current = prev[staffId]?.[key] ?? null;
      return { ...prev, [staffId]: { ...prev[staffId], [key]: nextStatus(current) } };
    });
  }

  async function handleSave(): Promise<void> {
    if (!staffList) return;
    setError(null);
    const rows: Array<{
      staffId: string;
      date: string;
      status: AttendanceStatus;
      wageRatePaisa: number;
      staffRole: 'technician' | 'salesman' | 'helper' | null;
    }> = [];

    for (const staff of staffList) {
      for (const day of days) {
        const key = dateKey(year, month, day);
        const currentStatus = grid[staff.id]?.[key] ?? null;
        const savedStatus = savedGrid[staff.id]?.[key] ?? null;
        if (currentStatus !== savedStatus && currentStatus !== null) {
          rows.push({
            staffId: staff.id,
            date: key,
            status: currentStatus,
            wageRatePaisa: staff.wageRatePaisa,
            staffRole: staff.staffRole,
          });
        }
      }
    }

    if (rows.length === 0) return;

    setSaving(true);
    try {
      await ipc.staff.saveAttendance({ rows });
      setSavedGrid(grid);
      setMessage('Attendance saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  }

  function handleCellKeyDown(
    e: React.KeyboardEvent<HTMLButtonElement>,
    staffId: string,
    key: string,
  ): void {
    if (e.key === ' ') {
      e.preventDefault();
      cycleCell(staffId, key);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void handleSave();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attendance"
        actions={
          <Button
            variant="primary"
            disabled={!isDirty || saving}
            onClick={() => {
              void handleSave();
            }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}

      <div className="flex flex-wrap items-end gap-4">
        <Select
          label="Month"
          value={String(month)}
          onChange={(e) => {
            setMonth(Number(e.target.value));
          }}
        >
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          label="Year"
          value={String(year)}
          onChange={(e) => {
            setYear(Number(e.target.value));
          }}
        >
          {[year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>

      {staffList === null ? (
        <LoadingState message="Loading attendance…" />
      ) : staffList.length === 0 ? (
        <EmptyState message="No staff yet." hint="Add a staff member from the Staff tab first." />
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 border-b border-line bg-surface px-3 py-2 text-left font-medium text-ink-muted">
                  Staff
                </th>
                {days.map((day) => (
                  <th
                    key={day}
                    className="border-b border-line px-1 py-2 text-center font-medium text-ink-muted"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staffList.map((staff) => (
                <tr key={staff.id}>
                  <td className="sticky left-0 whitespace-nowrap border-b border-line bg-surface px-3 py-1 font-medium text-ink">
                    {staff.name}
                  </td>
                  {days.map((day) => {
                    const key = dateKey(year, month, day);
                    const status = grid[staff.id]?.[key] ?? null;
                    return (
                      <td key={day} className="border-b border-line p-0.5 text-center">
                        <button
                          type="button"
                          aria-label={`${staff.name} — day ${String(day)}${status ? ` — ${status}` : ''}`}
                          onClick={() => {
                            cycleCell(staff.id, key);
                          }}
                          onKeyDown={(e) => {
                            handleCellKeyDown(e, staff.id, key);
                          }}
                          className={`h-7 w-7 rounded text-xs font-semibold transition-colors focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus ${
                            status
                              ? STATUS_CLASSES[status]
                              : 'bg-surface-sunken text-ink-faint hover:bg-line'
                          }`}
                        >
                          {status ? STATUS_LABEL[status] : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
