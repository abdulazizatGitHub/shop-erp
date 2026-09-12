import { useEffect, useMemo, useState } from 'react';
import { Building2, Search } from 'lucide-react';
import type { SupplierDto } from '@shop/contracts';
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

/** A supplier's balance is 'error' once its own fetch has failed — never retried silently. */
type BalanceState = number | 'error';

export function SupplierListView(): React.JSX.Element {
  const [suppliers, setSuppliers] = useState<readonly SupplierDto[]>([]);
  const [balances, setBalances] = useState<Record<string, BalanceState>>({});
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ipc.party
      .search({ query: '' })
      .then((rows) => {
        setSuppliers(rows);
        setError(null);
        // P4.5-4: every balance is fetched eagerly, in parallel, once —
        // not the old per-row "Load" button. Each cell shows a spinner
        // until its own call resolves.
        rows.forEach((supplier) => {
          ipc.party
            .balance(supplier.id)
            .then((balance) => {
              setBalances((prev) => ({ ...prev, [supplier.id]: balance.balancePaisa }));
            })
            .catch(() => {
              setBalances((prev) => ({ ...prev, [supplier.id]: 'error' }));
            });
        });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load suppliers');
      });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.partyCode.toLowerCase().includes(q) ||
        (s.phone ?? '').toLowerCase().includes(q),
    );
  }, [suppliers, query]);

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="danger">{error}</Alert>}
      <TextInput
        variant="search"
        autoFocus
        icon={<Search size={16} strokeWidth={1.5} />}
        placeholder="Search by name, code, or phone…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
      />
      {suppliers.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <EmptyState
            icon={<Building2 size={40} strokeWidth={1.5} />}
            message="No suppliers yet"
            hint="Add your first supplier or import balances from a CSV file."
          />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message={`No suppliers match "${query}".`} />
      ) : (
        <Table>
          <TableHead>
            <TableRow zebra={false} hover="neutral">
              <TableHeaderCell className="tracking-wide text-ink-faint">Code</TableHeaderCell>
              <TableHeaderCell className="tracking-wide text-ink-faint">Name</TableHeaderCell>
              <TableHeaderCell className="tracking-wide text-ink-faint">Shop Name</TableHeaderCell>
              <TableHeaderCell className="tracking-wide text-ink-faint">Phone</TableHeaderCell>
              <TableHeaderCell className="text-right tracking-wide text-ink-faint">
                Balance
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((supplier) => {
              const supplierBalance = balances[supplier.id];
              return (
                <TableRow key={supplier.id} zebra={false} hover="neutral">
                  <TableCell className="py-3">
                    <span className="inline-flex items-center rounded border border-line bg-surface-page px-2 py-0.5 font-mono text-xs text-ink-faint">
                      {supplier.partyCode}
                    </span>
                  </TableCell>
                  <TableCell className="py-3">{supplier.name}</TableCell>
                  <TableCell className="py-3">{supplier.shopName ?? '—'}</TableCell>
                  <TableCell className="py-3">{supplier.phone ?? '—'}</TableCell>
                  <TableCell className="py-3 text-right">
                    {supplierBalance === undefined ? (
                      <Spinner size="sm" />
                    ) : supplierBalance === 'error' ? (
                      '—'
                    ) : (
                      <MoneyDisplay
                        paisaValue={supplierBalance}
                        tone={
                          supplierBalance > 0 ? 'positive' : supplierBalance < 0 ? 'auto' : 'muted'
                        }
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
