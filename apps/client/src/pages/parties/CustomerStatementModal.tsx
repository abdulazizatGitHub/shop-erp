import { useState } from 'react';
import { Printer, X } from 'lucide-react';
import type { CustomerStatementDto } from '@shop/contracts';
import {
  Alert,
  Badge,
  Button,
  DocumentFooter,
  DocumentHeader,
  Modal,
  MoneyDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from '@shop/ui';
import type { BadgeTone } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

/** Mirrors CustomerLedgerTable.tsx's own BADGE_TONE map. */
const BADGE_TONE: Record<string, BadgeTone> = {
  sale: 'brand',
  opening_balance: 'neutral',
  payment_received: 'success',
  sale_return: 'warning',
};

export interface CustomerStatementModalProps {
  readonly customerId: string;
  readonly customerName: string;
  readonly onClose: () => void;
}

function firstOfMonth(): string {
  const d = new Date();
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** CL-8E. Date-range statement preview + print — no preset shortcuts, per owner decision. */
export function CustomerStatementModal({
  customerId,
  customerName,
  onClose,
}: CustomerStatementModalProps): React.JSX.Element {
  const { showToast } = useToast();
  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(todayIso);
  const [statement, setStatement] = useState<CustomerStatementDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleLoad(): void {
    setError(null);
    setLoading(true);
    ipc.customer
      .statement({ customerId, fromDate, toDate })
      .then((result) => {
        setStatement(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load statement');
        setLoading(false);
      });
  }

  async function handlePrint(): Promise<void> {
    const result = await ipc.print.printCustomerStatement({ customerId, fromDate, toDate });
    if (result.printError) showToast({ variant: 'error', message: result.printError });
  }

  return (
    <Modal open title={`Account Statement — ${customerName}`} onClose={onClose} size="wide">
      {/* Modal.tsx (packages/ui) has no max-height of its own, so this
          wrapper caps the whole body at a viewport-relative height and
          scrolls internally — the date row and action buttons stay
          flex-shrink-0 so they're always visible no matter how many
          ledger rows the loaded statement has. */}
      <div className="flex max-h-[calc(85vh-3rem)] flex-col">
        {error && (
          <div className="flex-shrink-0 pb-3">
            <Alert variant="danger">{error}</Alert>
          </div>
        )}

        <div className="flex flex-shrink-0 flex-wrap items-end gap-3 pb-4">
          <label className="flex flex-col gap-1 text-sm text-ink-muted">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
              }}
              className="rounded-md border border-line bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink-muted">
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
              }}
              className="rounded-md border border-line bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
            />
          </label>
          <Button variant="primary" disabled={loading} onClick={handleLoad}>
            {loading ? 'Loading…' : 'Load'}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {statement && (
            <div className="flex flex-col gap-4 border-t border-line pt-4">
              <DocumentHeader layout="row" />

              <div className="flex items-center justify-between rounded-md bg-warning-subtle px-3 py-2">
                <span className="text-sm text-ink-muted">
                  Balance b/f as of {statement.fromDate}
                </span>
                <MoneyDisplay paisaValue={statement.openingBalancePaisa} />
              </div>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Date</TableHeaderCell>
                    <TableHeaderCell>Type</TableHeaderCell>
                    <TableHeaderCell>Reference</TableHeaderCell>
                    <TableHeaderCell className="text-right">Debit</TableHeaderCell>
                    <TableHeaderCell className="text-right">Credit</TableHeaderCell>
                    <TableHeaderCell className="text-right">Balance</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {statement.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.entryDate}</TableCell>
                      <TableCell>
                        <Badge tone={BADGE_TONE[row.entryType] ?? 'neutral'}>{row.entryType}</Badge>
                      </TableCell>
                      <TableCell>
                        {row.saleDocNo ?? row.paymentDocNo ?? row.billReference ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.amountPaisa > 0 ? (
                          <MoneyDisplay paisaValue={row.amountPaisa} tone="out" size="sm" />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.amountPaisa < 0 ? (
                          <MoneyDisplay
                            paisaValue={Math.abs(row.amountPaisa)}
                            tone="in"
                            size="sm"
                          />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyDisplay
                          paisaValue={row.runningBalancePaisa}
                          tone={row.runningBalancePaisa > 0 ? 'due' : 'positive'}
                          size="sm"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between rounded-md px-3 py-2 text-base font-semibold">
                <span>Closing balance as of {statement.toDate}</span>
                <MoneyDisplay
                  paisaValue={statement.closingBalancePaisa}
                  tone={statement.closingBalancePaisa > 0 ? 'due' : 'positive'}
                />
              </div>

              <DocumentFooter />
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 justify-end gap-3 border-t border-line pt-3">
          <Button
            variant="secondary"
            disabled={!statement}
            onClick={() => {
              void handlePrint();
            }}
          >
            <Printer size={16} aria-hidden="true" />
            Print statement
          </Button>
          <Button variant="primary" onClick={onClose}>
            <X size={16} aria-hidden="true" />
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
