import { useEffect, useMemo, useState } from 'react';
import type { CustomerDto } from '@shop/contracts';
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

/** A customer's balance is 'error' once its own fetch has failed — never retried silently. */
type BalanceState = number | 'error';

/** P4.5-8 — same eager-parallel-balance-load pattern as SupplierListView. */
export function CustomerListView(): React.JSX.Element {
  const [customers, setCustomers] = useState<readonly CustomerDto[]>([]);
  const [balances, setBalances] = useState<Record<string, BalanceState>>({});
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ipc.customer
      .search({ query: '' })
      .then((rows) => {
        setCustomers(rows);
        setError(null);
        rows.forEach((customer) => {
          ipc.customer
            .balance(customer.id)
            .then((balance) => {
              setBalances((prev) => ({ ...prev, [customer.id]: balance.balancePaisa }));
            })
            .catch(() => {
              setBalances((prev) => ({ ...prev, [customer.id]: 'error' }));
            });
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
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Code</TableHeaderCell>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Phone</TableHeaderCell>
              <TableHeaderCell className="text-right">Balance</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((customer) => {
              const customerBalance = balances[customer.id];
              return (
                <TableRow key={customer.id}>
                  <TableCell>{customer.partyCode}</TableCell>
                  <TableCell>{customer.name}</TableCell>
                  <TableCell>{customer.phone ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    {customerBalance === undefined ? (
                      <Spinner size="sm" />
                    ) : customerBalance === 'error' ? (
                      '—'
                    ) : (
                      <MoneyDisplay
                        paisaValue={customerBalance}
                        tone={customerBalance === 0 ? 'muted' : 'auto'}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
