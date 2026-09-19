import { useEffect, useState } from 'react';
import { ExternalLink, MousePointerClick } from 'lucide-react';
import type { CustomerLedgerRowDto } from '@shop/contracts';
import {
  Badge,
  EmptyState,
  MoneyDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
import type { BadgeTone } from '@shop/ui';
import { Pagination } from '../../components/shared/Pagination.js';
import { DESCRIPTIONS } from './ledger-entry-descriptions.js';
import { LedgerExportMenu } from './LedgerExportMenu.js';

const BADGE_TONE: Record<string, BadgeTone> = {
  sale: 'brand',
  opening_balance: 'neutral',
  payment_received: 'success',
  sale_return: 'warning',
};

type LedgerFilter = 'all' | 'sale' | 'payment';

const FILTERS: ReadonlyArray<{ readonly key: LedgerFilter; readonly label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'sale', label: 'Sales' },
  { key: 'payment', label: 'Payments' },
];

// Mirrors DateRangeSelector.tsx's own active/inactive preset-chip pattern.
const INACTIVE_CHIP_CLASS =
  'rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:border-brand hover:text-brand';
const ACTIVE_CHIP_CLASS =
  'rounded-md border border-brand bg-brand px-3 py-1.5 text-sm font-medium text-white transition-colors';

const ROWS_PER_PAGE = 15;

export interface CustomerLedgerTableProps {
  readonly rows: readonly CustomerLedgerRowDto[];
  readonly customerCode: string;
  readonly onSelectSale: (saleId: string) => void;
  readonly onSelectPayment: (paymentId: string) => void;
}

/** CL-5, extended with filter chips + pagination. Clicking a sale/payment row opens its document. */
export function CustomerLedgerTable({
  rows,
  customerCode,
  onSelectSale,
  onSelectPayment,
}: CustomerLedgerTableProps): React.JSX.Element {
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [filter, rows]);

  const filtered = filter === 'all' ? rows : rows.filter((r) => r.sourceType === filter);
  const paged = filtered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  return (
    <div className="rounded-2xl bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,.06),0_4px_16px_rgba(0,0,0,.06)]">
      {rows.length === 0 ? (
        <EmptyState message="No ledger entries yet." />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setFilter(f.key);
                }}
                className={filter === f.key ? ACTIVE_CHIP_CLASS : INACTIVE_CHIP_CLASS}
              >
                {f.label}
              </button>
            ))}
            <span className="ml-auto text-xs text-ink-faint">
              {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
            </span>
            <LedgerExportMenu rows={rows} customerCode={customerCode} />
          </div>
          <span className="flex items-center gap-1 text-xs text-ink-faint">
            <MousePointerClick size={13} aria-hidden="true" />
            Click a sale or payment row to view details
          </span>
          {filtered.length === 0 ? (
            <EmptyState message="No entries match this filter." />
          ) : (
            <>
              <Table>
                <TableHead>
                  <TableRow zebra={false} hover="neutral">
                    <TableHeaderCell className="tracking-wide text-ink-faint">Date</TableHeaderCell>
                    <TableHeaderCell className="tracking-wide text-ink-faint">Type</TableHeaderCell>
                    <TableHeaderCell className="tracking-wide text-ink-faint">
                      Reference
                    </TableHeaderCell>
                    <TableHeaderCell className="tracking-wide text-ink-faint">
                      Description
                    </TableHeaderCell>
                    <TableHeaderCell className="text-right tracking-wide text-ink-faint">
                      Debit
                    </TableHeaderCell>
                    <TableHeaderCell className="text-right tracking-wide text-ink-faint">
                      Credit
                    </TableHeaderCell>
                    <TableHeaderCell className="text-right tracking-wide text-ink-faint">
                      Balance
                    </TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paged.map((row) => {
                    const clickable = row.sourceType === 'sale' || row.sourceType === 'payment';
                    return (
                      <TableRow
                        key={row.id}
                        zebra={false}
                        hover="neutral"
                        onClick={
                          clickable
                            ? () => {
                                if (row.sourceType === 'sale' && row.sourceId !== null) {
                                  onSelectSale(row.sourceId);
                                } else if (row.sourceType === 'payment' && row.sourceId !== null) {
                                  onSelectPayment(row.sourceId);
                                }
                              }
                            : undefined
                        }
                      >
                        <TableCell>{row.entryDate}</TableCell>
                        <TableCell>
                          <Badge tone={BADGE_TONE[row.entryType] ?? 'neutral'}>
                            {row.entryType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {row.saleDocNo ?? row.paymentDocNo ?? row.billReference ?? '—'}
                        </TableCell>
                        <TableCell>
                          {clickable ? (
                            <span className="group/desc inline-flex items-center">
                              {DESCRIPTIONS[row.entryType] ?? row.entryType}
                              <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-brand opacity-0 transition-opacity group-hover/desc:opacity-100">
                                <ExternalLink size={11} aria-hidden="true" />
                                {row.sourceType === 'sale' ? 'view invoice' : 'view receipt'}
                              </span>
                            </span>
                          ) : (
                            (DESCRIPTIONS[row.entryType] ?? row.entryType)
                          )}
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
                    );
                  })}
                </TableBody>
              </Table>
              <Pagination
                totalRows={filtered.length}
                rowsPerPage={ROWS_PER_PAGE}
                currentPage={page}
                onPageChange={setPage}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
