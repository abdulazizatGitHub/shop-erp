import { useEffect, useState } from 'react';
import { ArrowLeft, Banknote, FileText, MapPin, Phone } from 'lucide-react';
import type { CustomerBalanceDto, CustomerDto, CustomerLedgerRowDto } from '@shop/contracts';
import { Alert, Button, LoadingState } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { CustomerLedgerTable } from './CustomerLedgerTable.js';
import { CustomerStatCards } from './CustomerStatCards.js';
import { CustomerStatementModal } from './CustomerStatementModal.js';
import { PaymentReceiptModal } from './PaymentReceiptModal.js';
import { RecordPaymentModal } from './RecordPaymentModal.js';
import { SaleInvoiceModal } from './SaleInvoiceModal.js';

export interface CustomerDetailPageProps {
  readonly customerId: string;
  readonly onBack: () => void;
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + second).toUpperCase();
}

/** CL-5. Customer's full financial history — stat cards + ledger table + document modals. */
export function CustomerDetailPage({
  customerId,
  onBack,
}: CustomerDetailPageProps): React.JSX.Element {
  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [balance, setBalance] = useState<CustomerBalanceDto | null>(null);
  const [ledger, setLedger] = useState<readonly CustomerLedgerRowDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    setError(null);
    Promise.all([
      ipc.customer.get(customerId),
      ipc.customer.balance(customerId),
      ipc.customer.ledger({ customerId }),
    ])
      .then(([customerResult, balanceResult, ledgerResult]) => {
        setCustomer(customerResult);
        setBalance(balanceResult);
        setLedger(ledgerResult);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load customer');
      });
  }, [customerId, refreshToken]);

  function refresh(): void {
    setRefreshToken((v) => v + 1);
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex w-fit items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Customers
        </button>
        <Alert variant="danger">{error}</Alert>
      </div>
    );
  }

  if (customer === null || balance === null || ledger === null) {
    return <LoadingState />;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="mb-2 flex items-start justify-between rounded-2xl bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,.06),0_4px_16px_rgba(0,0,0,.06)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to customers"
            className="rounded-full p-1.5 text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-subtle text-sm font-medium text-brand">
            {initialsOf(customer.name)}
          </div>
          <div>
            <h1 className="text-lg font-medium text-ink">{customer.name}</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <code className="rounded border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-xs text-ink-muted">
                {customer.partyCode}
              </code>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-4">
              {customer.phone && (
                <span className="flex items-center gap-1 text-xs text-ink-muted">
                  <Phone size={11} aria-hidden="true" />
                  {customer.phone}
                </span>
              )}
              {customer.address && (
                <span className="flex items-center gap-1 text-xs text-ink-muted">
                  <MapPin size={11} aria-hidden="true" />
                  {customer.address}
                </span>
              )}
              {customer.customerType && (
                <span className="text-xs capitalize text-ink-muted">{customer.customerType}</span>
              )}
              {customer.notes && <span className="text-xs text-ink-muted">{customer.notes}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setStatementOpen(true);
            }}
          >
            <FileText size={16} aria-hidden="true" />
            Statement
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setPaymentOpen(true);
            }}
          >
            <Banknote size={16} aria-hidden="true" />
            Receive payment
          </Button>
        </div>
      </div>

      <CustomerStatCards balance={balance} ledger={ledger} />

      <CustomerLedgerTable
        rows={ledger}
        customerCode={customer.partyCode}
        onSelectSale={setSelectedSaleId}
        onSelectPayment={setSelectedPaymentId}
      />

      <RecordPaymentModal
        open={paymentOpen}
        onClose={() => {
          setPaymentOpen(false);
        }}
        partyId={customerId}
        customerName={customer.name}
        currentBalancePaisa={balance.balancePaisa}
        onPaid={() => {
          refresh();
        }}
      />

      {statementOpen && (
        <CustomerStatementModal
          customerId={customerId}
          customerName={customer.name}
          onClose={() => {
            setStatementOpen(false);
          }}
        />
      )}

      <SaleInvoiceModal
        saleId={selectedSaleId}
        onClose={() => {
          setSelectedSaleId(null);
        }}
      />

      <PaymentReceiptModal
        paymentId={selectedPaymentId}
        onClose={() => {
          setSelectedPaymentId(null);
        }}
      />
    </div>
  );
}
