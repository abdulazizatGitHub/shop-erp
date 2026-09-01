import { useEffect, useMemo, useState } from 'react';
import type { ReceivablesAgingRowDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import {
  Alert,
  EmptyState,
  LoadingState,
  MoneyDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

type ChipTone = 'plain' | 'light-warning' | 'warning' | 'danger';

const CHIP_CLASSES: Record<Exclude<ChipTone, 'plain'>, string> = {
  'light-warning': 'bg-warning/15 text-warning',
  warning: 'bg-warning text-white',
  danger: 'bg-danger text-white',
};

/**
 * Bucket cells don't go through MoneyDisplay: the 'warning'/'danger' tones
 * need white text on a solid chip background, which MoneyDisplay's own
 * (negative-is-red-else-ink) color logic can't express. Still uses
 * Money.format — the same formatting function, just not the wrapper's
 * color choice — and keeps font-mono/tabular-nums for column alignment.
 */
function AgingAmount({
  paisaValue,
  tone,
}: {
  readonly paisaValue: number;
  readonly tone: ChipTone;
}): React.JSX.Element {
  if (paisaValue === 0) {
    return <span className="font-mono text-sm tabular-nums text-ink-faint">—</span>;
  }
  if (tone === 'plain') {
    return (
      <span className="font-mono text-sm tabular-nums text-ink">
        {Money.format(Money.of(paisaValue))}
      </span>
    );
  }
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 font-mono text-sm tabular-nums ${CHIP_CLASSES[tone]}`}
    >
      {Money.format(Money.of(paisaValue))}
    </span>
  );
}

/** R3 — no inputs; asOfDate is computed server-side (today), never sent from the client. */
export function ReceivablesAgingReport(): React.JSX.Element {
  const [rows, setRows] = useState<readonly ReceivablesAgingRowDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ipc.report
      .receivables()
      .then(setRows)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load receivables aging');
      });
  }, []);

  // Only customers who actually owe something — matches the spec's
  // "Only show customers with balance > 0."
  const owing = useMemo(() => (rows ?? []).filter((row) => row.totalBalancePaisa > 0), [rows]);

  const totalPaisa = useMemo(
    () => Money.sum(owing.map((row) => Money.of(row.totalBalancePaisa))),
    [owing],
  );

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!rows) return <LoadingState message="Loading receivables aging…" />;

  return (
    <div className="flex flex-col gap-4">
      {owing.length === 0 ? (
        <EmptyState message="No customers currently owe a balance." />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Customer</TableHeaderCell>
              <TableHeaderCell className="text-right">Total</TableHeaderCell>
              <TableHeaderCell className="text-right">Current (≤30d)</TableHeaderCell>
              <TableHeaderCell className="text-right">31–60d</TableHeaderCell>
              <TableHeaderCell className="text-right">61–90d</TableHeaderCell>
              <TableHeaderCell className="text-right">90d+</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {owing.map((row) => (
              <TableRow key={row.customerId}>
                <TableCell>{row.customerName}</TableCell>
                <TableCell className="text-right">
                  <MoneyDisplay paisaValue={row.totalBalancePaisa} />
                </TableCell>
                <TableCell className="text-right">
                  <AgingAmount paisaValue={row.currentPaisa} tone="plain" />
                </TableCell>
                <TableCell className="text-right">
                  <AgingAmount paisaValue={row.days31To60Paisa} tone="light-warning" />
                </TableCell>
                <TableCell className="text-right">
                  <AgingAmount paisaValue={row.days61To90Paisa} tone="warning" />
                </TableCell>
                <TableCell className="text-right">
                  <AgingAmount paisaValue={row.over90Paisa} tone="danger" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <div className="flex items-center justify-end gap-3 border-t border-line pt-3">
        <span className="text-lg font-semibold text-ink">Total Receivables</span>
        <MoneyDisplay paisaValue={totalPaisa} size="xl" />
      </div>
    </div>
  );
}
