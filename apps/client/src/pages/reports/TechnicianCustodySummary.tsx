import { useEffect, useState } from 'react';
import {
  Alert,
  EmptyState,
  LoadingState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

interface CustodySummaryRow {
  readonly technicianId: string;
  readonly technicianName: string;
  readonly itemsHeld: number;
  readonly lastMovement: string | null;
}

/**
 * Quantities across different items (kg of gas vs. a compressor count) can't
 * be summed into one meaningful number, so this shows a distinct-item count
 * per technician, not a quantity total — see TechnicianCustodyPage for the
 * real per-item detail. Fans out one getTechnicianCustody call per
 * technician (small, fixed-size list — no date-ranged read exists for this).
 */
export function TechnicianCustodySummary(): React.JSX.Element {
  const [rows, setRows] = useState<readonly CustodySummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ipc.job
      .listTechnicians()
      .then(async (technicians) => {
        const summaries = await Promise.all(
          technicians.map(async (t) => {
            const custody = await ipc.job.getTechnicianCustody({ technicianPartyId: t.id });
            const lastMovement = custody.reduce<string | null>(
              (latest, c) =>
                c.lastMovement && (!latest || c.lastMovement > latest) ? c.lastMovement : latest,
              null,
            );
            return {
              technicianId: t.id,
              technicianName: t.name,
              itemsHeld: custody.length,
              lastMovement,
            } satisfies CustodySummaryRow;
          }),
        );
        setRows(summaries);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load technician custody summary');
      });
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="danger">{error}</Alert>}
      {rows === null ? (
        <LoadingState message="Loading technician custody…" />
      ) : rows.length === 0 ? (
        <EmptyState message="No technicians on file." />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Technician</TableHeaderCell>
              <TableHeaderCell>Distinct Items Held</TableHeaderCell>
              <TableHeaderCell>Last Movement</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.technicianId}>
                <TableCell>{r.technicianName}</TableCell>
                <TableCell>{r.itemsHeld}</TableCell>
                <TableCell>{r.lastMovement ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
