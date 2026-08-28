import { useEffect, useMemo, useState } from 'react';
import type { CreateSupplierInput, SupplierDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { ipc } from '../../lib/ipc.js';
import { debounce } from '../../lib/debounce.js';
import { SuppliersImportPage } from './SuppliersImportPage.js';

type View = 'list' | 'add' | 'import';

const emptyForm = {
  name: '',
  shopName: '',
  phone: '',
  cityArea: '',
  paymentTerms: '',
  notes: '',
};

/** '' on a text input means "not entered" — CreateSupplierInput wants null there, not ''. */
function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function SuppliersPage(): React.JSX.Element {
  const [view, setView] = useState<View>('list');

  return (
    <div>
      <h1>Suppliers</h1>
      <nav>
        <button
          type="button"
          disabled={view === 'list'}
          onClick={() => {
            setView('list');
          }}
        >
          List / Search
        </button>{' '}
        <button
          type="button"
          disabled={view === 'add'}
          onClick={() => {
            setView('add');
          }}
        >
          Add New
        </button>{' '}
        <button
          type="button"
          disabled={view === 'import'}
          onClick={() => {
            setView('import');
          }}
        >
          Import Balances
        </button>
      </nav>
      <hr />
      {view === 'list' && <SupplierListView />}
      {view === 'add' && (
        <SupplierAddView
          onCreated={() => {
            setView('list');
          }}
        />
      )}
      {view === 'import' && <SuppliersImportPage />}
    </div>
  );
}

function SupplierListView(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly SupplierDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Lazily loaded, keyed by supplier id — null means "not loaded yet".
  const [balances, setBalances] = useState<Record<string, number | null>>({});

  const runSearch = useMemo(
    () =>
      debounce((q: string) => {
        ipc.party
          .search({ query: q })
          .then((rows) => {
            setResults(rows);
            setError(null);
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : 'Search failed');
          });
      }, 200),
    [],
  );

  useEffect(() => {
    runSearch(query);
  }, [query, runSearch]);

  function loadBalance(id: string): void {
    ipc.party
      .balance(id)
      .then((balance) => {
        setBalances((prev) => ({ ...prev, [id]: balance.balancePaisa }));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load balance');
      });
  }

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      <input
        autoFocus
        placeholder="Search suppliers by name"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
      />
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Shop Name</th>
            <th>Phone</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {results.map((supplier) => (
            <tr key={supplier.id}>
              <td>{supplier.partyCode}</td>
              <td>{supplier.name}</td>
              <td>{supplier.shopName ?? '—'}</td>
              <td>{supplier.phone ?? '—'}</td>
              <td>
                {balances[supplier.id] !== undefined ? (
                  Money.format(Money.of(balances[supplier.id] as number))
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      loadBalance(supplier.id);
                    }}
                  >
                    Load
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SupplierAddViewProps {
  readonly onCreated: () => void;
}

function SupplierAddView({ onCreated }: SupplierAddViewProps): React.JSX.Element {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function setField(
    field: keyof typeof emptyForm,
  ): (e: React.ChangeEvent<HTMLInputElement>) => void {
    return (e) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (form.name.trim().length === 0) {
      setError('Name is required');
      return;
    }
    if (form.phone.trim().length === 0) {
      setError('Phone is required');
      return;
    }
    const input: CreateSupplierInput = {
      partyCode: null,
      name: form.name.trim(),
      shopName: blankToNull(form.shopName),
      phone: form.phone.trim(),
      cityArea: blankToNull(form.cityArea),
      paymentTerms: blankToNull(form.paymentTerms),
      notes: blankToNull(form.notes),
    };
    try {
      const result = await ipc.party.create(input);
      setSuccessMessage(`Supplier created: ${result.partyCode}`);
      setForm(emptyForm);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create supplier');
    }
  }

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {successMessage && <p role="status">{successMessage}</p>}
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        <div>
          <label>
            Name
            <input autoFocus value={form.name} onChange={setField('name')} />
          </label>
        </div>
        <div>
          <label>
            Shop Name
            <input value={form.shopName} onChange={setField('shopName')} />
          </label>
        </div>
        <div>
          <label>
            Phone
            <input value={form.phone} onChange={setField('phone')} />
          </label>
        </div>
        <div>
          <label>
            City / Area
            <input value={form.cityArea} onChange={setField('cityArea')} />
          </label>
        </div>
        <div>
          <label>
            Payment Terms
            <input value={form.paymentTerms} onChange={setField('paymentTerms')} />
          </label>
        </div>
        <div>
          <label>
            Notes
            <input value={form.notes} onChange={setField('notes')} />
          </label>
        </div>
        <button type="submit">Create Supplier</button>
      </form>
    </div>
  );
}
