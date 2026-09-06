import { useEffect, useState } from 'react';
import type { AdvanceDto, StaffDto } from '@shop/contracts';
import {
  Alert,
  Button,
  EmptyState,
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
import { RecordAdvanceModal } from './RecordAdvanceModal.js';

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
 * PHASE_7.md §5 GAP-4 / P7-3 — lives on the Staff page, not a separate
 * route. staff:listAdvances takes one staffId + year + month (matching
 * the approved contract, not an all-staff fan-out), so this section
 * always shows one selected staff member's advances for one selected
 * month — the natural UI shape for that IPC contract. Fetches its own
 * staff list (small, independent duplication of StaffListView's own
 * fetch) rather than lifting shared state into StaffPage for two
 * call sites.
 */
export function AdvancesSection(): React.JSX.Element {
  const now = new Date();
  const [staffList, setStaffList] = useState<readonly StaffDto[]>([]);
  const [staffId, setStaffId] = useState<string>('');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [advances, setAdvances] = useState<readonly AdvanceDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);

  useEffect(() => {
    ipc.staff
      .listStaff()
      .then((rows) => {
        setStaffList(rows);
        setStaffId((prev) => (prev.length > 0 ? prev : (rows[0]?.id ?? '')));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load staff');
      });
  }, []);

  useEffect(() => {
    if (staffId.length === 0) return;
    ipc.staff
      .listAdvances({ staffId, year, month })
      .then((rows) => {
        setAdvances(rows);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load advances');
      });
  }, [staffId, year, month]);

  const totalPaisa = advances.reduce((sum, a) => sum + a.amountPaisa, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Peshgi (Advances)</h2>
        <Button
          variant="primary"
          disabled={staffList.length === 0}
          onClick={() => {
            setMessage(null);
            setRecordOpen(true);
          }}
        >
          Record Peshgi
        </Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}

      {staffList.length === 0 ? (
        <EmptyState message="Add a staff member before recording an advance." />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <Select
              label="Staff"
              value={staffId}
              onChange={(e) => {
                setStaffId(e.target.value);
              }}
            >
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.partyCode})
                </option>
              ))}
            </Select>
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

          {advances.length === 0 ? (
            <EmptyState message="No advances recorded for this staff member this month." />
          ) : (
            <>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Date</TableHeaderCell>
                    <TableHeaderCell>Staff</TableHeaderCell>
                    <TableHeaderCell className="text-right">Amount</TableHeaderCell>
                    <TableHeaderCell>PMT#</TableHeaderCell>
                    <TableHeaderCell>Notes</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {advances.map((advance) => (
                    <TableRow key={advance.id}>
                      <TableCell>{advance.date}</TableCell>
                      <TableCell>{advance.staffName}</TableCell>
                      <TableCell className="text-right">
                        <MoneyDisplay paisaValue={advance.amountPaisa} />
                      </TableCell>
                      <TableCell>{advance.docNo}</TableCell>
                      <TableCell>{advance.notes ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-sm text-ink-muted">
                Total: <MoneyDisplay paisaValue={totalPaisa} />
              </p>
            </>
          )}
        </>
      )}

      <RecordAdvanceModal
        open={recordOpen}
        onClose={() => {
          setRecordOpen(false);
        }}
        staffList={staffList}
        defaultStaffId={staffId.length > 0 ? staffId : null}
        onRecorded={(result) => {
          setRecordOpen(false);
          setMessage(`Advance recorded: ${result.docNo}`);
          if (result.staffId === staffId) {
            setAdvances((prev) => [...prev, result].sort((a, b) => a.date.localeCompare(b.date)));
          }
        }}
      />
    </div>
  );
}
