import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, MousePointerClick } from 'lucide-react';
import type { CustomerDto } from '@shop/contracts';
import type { MoneyDisplayProps } from '@shop/ui';
import {
  Alert,
  EmptyState,
  MoneyDisplay,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextInput,
} from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

/** Matches CustomerStatCards.tsx's own balance-tone convention — 'due' (amber)
 * for money owed, 'positive' (green) for zero/settled. Never a raw className
 * on a money value — MoneyDisplay is this project's only formatting point. */
function balanceTone(balancePaisa: number): NonNullable<MoneyDisplayProps['tone']> {
  if (balancePaisa === 0) return 'muted';
  return balancePaisa > 0 ? 'due' : 'positive';
}

/** A customer's balance is 'error' once its own fetch has failed — never retried silently. */
type BalanceState = number | 'error';

export interface CustomerListViewProps {
  /** Row click drills into CustomerDetailPage — see CustomersPage.tsx (CL-5). */
  readonly onSelectCustomer: (customerId: string) => void;
}

/**
 * P4.5-8 — same eager-parallel-balance-load pattern as SupplierListView.
 * CL-5: "Record Payment" moved off this list onto CustomerDetailPage's
 * header — a row click now opens the detail page instead.
 */
export function CustomerListView({ onSelectCustomer }: CustomerListViewProps): React.JSX.Element {
  const [customers, setCustomers] = useState<readonly CustomerDto[]>([]);
  const [balances, setBalances] = useState<Record<string, BalanceState>>({});
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  function loadBalance(customerId: string): void {
    ipc.customer
      .balance(customerId)
      .then((balance) => {
        setBalances((prev) => ({ ...prev, [customerId]: balance.balancePaisa }));
      })
      .catch(() => {
        setBalances((prev) => ({ ...prev, [customerId]: 'error' }));
      });
  }

  useEffect(() => {
    ipc.customer
      .search({ query: '' })
      .then((rows) => {
        setCustomers(rows);
        setError(null);
        rows.forEach((customer) => {
          loadBalance(customer.id);
        });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load customers');
      });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.partyCode.toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q),
    );
  }, [customers, query]);

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="danger">{error}</Alert>}
      <TextInput
        variant="search"
        placeholder="Search customers by name, code, or phone"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
      />
      {customers.length === 0 ? (
        <EmptyState
          message="No customers yet."
          hint="Import customer balances using the Import section below."
        />
      ) : filtered.length === 0 ? (
        <EmptyState message={`No customers match "${query}".`} />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow zebra={false} hover="neutral">
                <TableHeaderCell className="tracking-wide text-ink-faint">Code</TableHeaderCell>
                <TableHeaderCell className="tracking-wide text-ink-faint">Name</TableHeaderCell>
                <TableHeaderCell className="tracking-wide text-ink-faint">Phone</TableHeaderCell>
                <TableHeaderCell className="text-right tracking-wide text-ink-faint">
                  Balance
                </TableHeaderCell>
                <TableHeaderCell aria-hidden="true" />
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((customer) => {
                const customerBalance = balances[customer.id];
                return (
                  <TableRow
                    key={customer.id}
                    zebra={false}
                    hover="neutral"
                    onClick={() => {
                      onSelectCustomer(customer.id);
                    }}
                  >
                    <TableCell className="py-3">
                      <span className="inline-flex items-center rounded border border-line bg-surface-page px-2 py-0.5 font-mono text-xs text-ink-faint">
                        {customer.partyCode}
                      </span>
                    </TableCell>
                    <TableCell className="py-3">{customer.name}</TableCell>
                    <TableCell className="py-3">{customer.phone ?? '—'}</TableCell>
                    <TableCell className="py-3 text-right">
                      {customerBalance === undefined ? (
                        <Spinner size="sm" />
                      ) : customerBalance === 'error' ? (
                        '—'
                      ) : (
                        <MoneyDisplay
                          paisaValue={customerBalance}
                          tone={balanceTone(customerBalance)}
                          size="sm"
                        />
                      )}
                    </TableCell>
                    <TableCell className="w-6 pl-0">
                      <ChevronRight size={14} className="text-ink-faint" aria-hidden="true" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="flex items-center gap-1 border-t border-line px-4 py-2 text-xs text-ink-faint">
            <MousePointerClick size={13} aria-hidden="true" />
            Click any row to open that customer&apos;s ledger
          </p>
        </>
      )}
    </div>
  );
}
