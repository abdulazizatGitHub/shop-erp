import { useEffect, useMemo, useState } from 'react';
import type { StaffDto } from '@shop/contracts';
import {
  Alert,
  EmptyState,
  MoneyDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextInput,
} from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

const ROLE_LABELS: Record<string, string> = {
  technician: 'Technician',
  salesman: 'Salesman',
  helper: 'Helper',
};

export function StaffListView(): React.JSX.Element {
  const [staff, setStaff] = useState<readonly StaffDto[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ipc.staff
      .listStaff()
      .then((rows) => {
        setStaff(rows);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load staff');
      });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return staff;
    return staff.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.partyCode.toLowerCase().includes(q) ||
        (s.phone ?? '').toLowerCase().includes(q),
    );
  }, [staff, query]);

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="danger">{error}</Alert>}
      <TextInput
        variant="search"
        placeholder="Search staff by name, code, or phone"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
      />
      {staff.length === 0 ? (
        <EmptyState
          message="No staff yet."
          hint="Use Add Staff Member to create the first row before entering attendance."
        />
      ) : filtered.length === 0 ? (
        <EmptyState message={`No staff match "${query}".`} />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Code</TableHeaderCell>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Phone</TableHeaderCell>
              <TableHeaderCell>Role</TableHeaderCell>
              <TableHeaderCell className="text-right">Daily rate</TableHeaderCell>
              <TableHeaderCell className="text-right">Commission</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((member) => (
              <TableRow key={member.id}>
                <TableCell>{member.partyCode}</TableCell>
                <TableCell>{member.name}</TableCell>
                <TableCell>{member.phone ?? '—'}</TableCell>
                <TableCell>{ROLE_LABELS[member.staffRole] ?? member.staffRole}</TableCell>
                <TableCell className="text-right">
                  <MoneyDisplay paisaValue={member.wageRatePaisa} />
                </TableCell>
                <TableCell className="text-right">{member.commissionBp / 100}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
