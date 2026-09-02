import { useEffect, useMemo, useState } from 'react';
import type { CustomerDto, PaymentDto } from '@shop/contracts';
import {
  Alert,
  Button,
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
import { RecordPaymentModal } from './RecordPaymentModal.js';

/** A customer's balance is 'error' once its own fetch has failed — never retried silently. */
type BalanceState = number | 'error';

/**
 * P4.5-8 — same eager-parallel-balance-load pattern as SupplierListView.
 * BUG-NEW3 fix (CRITICAL, Phase 5): added the "Record Payment" action,
 * self-contained here per explicit decision — CustomersPage.tsx is not
 * touched. loadBalance() is the same fetch the mount effect always did,
 * pulled into a named function so a successful payment can re-run it for
 * just the one affected customer instead of reloading the whole list.
 */
export function CustomerListView(): React.JSX.Element {
  const [customers, setCustomers] = useState<readonly CustomerDto[]>([]);
  const [balances, setBalances] = useState<Record<string, BalanceState>>({});
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<CustomerDto | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  function handlePaid(result: PaymentDto): void {
    setPaymentTarget(null);
    setSuccessMessage(`Payment recorded — ${result.docNo}`);
    loadBalance(result.partyId);
  }

  const targetBalance = paymentTarget && balances[paymentTarget.id];
  const targetBalancePaisa = typeof targetBalance === 'number' ? targetBalance : 0;

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="danger">{error}</Alert>}
      {successMessage && <Alert variant="success">{successMessage}</Alert>}
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
              <TableHeaderCell className="text-right">Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((customer) => {
              const customerBalance = balances[customer.id];
              const balanceReady = typeof customerBalance === 'number';
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
                  <TableCell className="text-right">
                    <Button
                      variant="secondary"
                      disabled={!balanceReady}
                      onClick={() => {
                        setSuccessMessage(null);
                        setPaymentTarget(customer);
                      }}
                    >
                      Record Payment
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {paymentTarget && (
        <RecordPaymentModal
          open
          onClose={() => {
            setPaymentTarget(null);
          }}
          partyId={paymentTarget.id}
          customerName={paymentTarget.name}
          currentBalancePaisa={targetBalancePaisa}
          onPaid={handlePaid}
        />
      )}
    </div>
  );
}
