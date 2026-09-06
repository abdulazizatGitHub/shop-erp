import { useEffect, useState } from 'react';
import type { WageMonthRowDto } from '@shop/contracts';
import {
  Alert,
  EmptyState,
  LoadingState,
  MoneyDisplay,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
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

/**
 * P7-11 — read-only. No export, no printing (per the brief). Every
 * money column goes through MoneyDisplay — no raw /100 division
 * anywhere in this component.
 */
export function WageMonthReport(): React.JSX.Element {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<readonly WageMonthRowDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    ipc.report
      .wageMonth({ year, month })
      .then(setRows)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load wage report');
      });
  }, [year, month]);

  return (
    <div className="flex flex-col gap-4">
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

      {error && <Alert variant="danger">{error}</Alert>}

      {rows === null ? (
        <LoadingState message="Loading wage report…" />
      ) : rows.length === 0 ? (
        <EmptyState message="No attendance records for this month." />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Role</TableHeaderCell>
              <TableHeaderCell className="text-right">Days</TableHeaderCell>
              <TableHeaderCell className="text-right">Half-days</TableHeaderCell>
              <TableHeaderCell className="text-right">Absent</TableHeaderCell>
              <TableHeaderCell className="text-right">Leave</TableHeaderCell>
              <TableHeaderCell className="text-right">Holiday</TableHeaderCell>
              <TableHeaderCell className="text-right">Gross</TableHeaderCell>
              <TableHeaderCell className="text-right">Advances</TableHeaderCell>
              <TableHeaderCell className="text-right">Commission</TableHeaderCell>
              <TableHeaderCell className="text-right">Net Due</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.staffId}>
                <TableCell>{row.staffName}</TableCell>
                <TableCell>{row.staffRole}</TableCell>
                <TableCell className="text-right">{row.fullDays}</TableCell>
                <TableCell className="text-right">{row.halfDays}</TableCell>
                <TableCell className="text-right">{row.absentDays}</TableCell>
                <TableCell className="text-right">{row.leaveDays}</TableCell>
                <TableCell className="text-right">{row.holidayDays}</TableCell>
                <TableCell className="text-right">
                  <MoneyDisplay paisaValue={row.grossPaisa} />
                </TableCell>
                <TableCell className="text-right">
                  <MoneyDisplay paisaValue={row.advancesPaisa} />
                </TableCell>
                <TableCell className="text-right">
                  <MoneyDisplay paisaValue={row.commissionPaisa} />
                </TableCell>
                <TableCell className="text-right">
                  <MoneyDisplay paisaValue={row.netPaisa} size="lg" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
