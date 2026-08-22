import { useEffect, useState } from 'react';
import type { ItemDto, ItemLookups } from '@shop/contracts';
import { Money } from '@shop/shared';
import { ipc } from '../../lib/ipc.js';

interface FormState {
  itemCode: string;
  nameEn: string;
  nameUr: string;
  businessUnitId: string;
  stockUomId: string;
  retailPriceRupees: string;
  trackStock: boolean;
}

const EMPTY_FORM: FormState = {
  itemCode: '',
  nameEn: '',
  nameUr: '',
  businessUnitId: '',
  stockUomId: '',
  retailPriceRupees: '',
  trackStock: true,
};

export function ItemsPage(): React.JSX.Element {
  const [lookups, setLookups] = useState<ItemLookups | null>(null);
  const [items, setItems] = useState<readonly ItemDto[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCategoryId, setSearchCategoryId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const runSearch = (query: string, categoryId: string): void => {
    ipc.item
      .search({ query, categoryId: categoryId.length > 0 ? categoryId : null })
      .then(setItems)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Search failed');
      });
  };

  useEffect(() => {
    ipc.item
      .lookups()
      .then((result) => {
        setLookups(result);
        setForm((prev) => ({
          ...prev,
          businessUnitId: result.businessUnits[0]?.id ?? '',
          stockUomId: result.uoms[0]?.id ?? '',
        }));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load lookups');
      });
    runSearch('', '');
  }, []);

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    let retailPricePaisa: number;
    try {
      retailPricePaisa = Money.fromRupees(form.retailPriceRupees);
    } catch {
      setError('Retail price is not a valid amount');
      return;
    }

    ipc.item
      .create({
        itemCode: form.itemCode.trim().length > 0 ? form.itemCode.trim() : null,
        nameEn: form.nameEn,
        nameUr: form.nameUr.trim().length > 0 ? form.nameUr.trim() : null,
        businessUnitId: form.businessUnitId,
        stockUomId: form.stockUomId,
        retailPricePaisa,
        trackStock: form.trackStock,
      })
      .then((result) => {
        setMessage(`Created ${result.itemCode}`);
        setForm((prev) => ({
          ...EMPTY_FORM,
          businessUnitId: prev.businessUnitId,
          stockUomId: prev.stockUomId,
        }));
        runSearch(searchQuery, searchCategoryId);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to create item');
      });
  };

  const businessUnitName = (id: string): string =>
    lookups?.businessUnits.find((bu) => bu.id === id)?.name ?? id;
  const uomName = (id: string): string => lookups?.uoms.find((u) => u.id === id)?.name ?? id;

  return (
    <div>
      <h1>Items</h1>

      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

      <form onSubmit={handleSubmit}>
        <div>
          <label>
            Item code (blank = auto)
            <input
              value={form.itemCode}
              onChange={(e) => {
                setForm({ ...form, itemCode: e.target.value });
              }}
            />
          </label>
        </div>
        <div>
          <label>
            Name (English)
            <input
              required
              value={form.nameEn}
              onChange={(e) => {
                setForm({ ...form, nameEn: e.target.value });
              }}
            />
          </label>
        </div>
        <div>
          <label>
            Name (Urdu)
            <input
              value={form.nameUr}
              onChange={(e) => {
                setForm({ ...form, nameUr: e.target.value });
              }}
            />
          </label>
        </div>
        <div>
          <label>
            Business unit
            <select
              required
              value={form.businessUnitId}
              onChange={(e) => {
                setForm({ ...form, businessUnitId: e.target.value });
              }}
            >
              {lookups?.businessUnits.map((bu) => (
                <option key={bu.id} value={bu.id}>
                  {bu.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <label>
            Selling unit
            <select
              required
              value={form.stockUomId}
              onChange={(e) => {
                setForm({ ...form, stockUomId: e.target.value });
              }}
            >
              {lookups?.uoms.map((uom) => (
                <option key={uom.id} value={uom.id}>
                  {uom.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <label>
            Retail price (Rs)
            <input
              required
              inputMode="decimal"
              value={form.retailPriceRupees}
              onChange={(e) => {
                setForm({ ...form, retailPriceRupees: e.target.value });
              }}
            />
          </label>
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              checked={form.trackStock}
              onChange={(e) => {
                setForm({ ...form, trackStock: e.target.checked });
              }}
            />
            Track stock
          </label>
        </div>
        <button type="submit">Create item</button>
      </form>

      <hr />

      <label>
        Search
        <input
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            runSearch(e.target.value, searchCategoryId);
          }}
        />
      </label>

      <label>
        Category
        <select
          value={searchCategoryId}
          onChange={(e) => {
            setSearchCategoryId(e.target.value);
            runSearch(searchQuery, e.target.value);
          }}
        >
          <option value="">All categories</option>
          {lookups?.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Business unit</th>
            <th>Unit</th>
            <th>Retail price</th>
            <th>Track stock</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.itemCode}</td>
              <td>{item.nameEn}</td>
              <td>{item.businessUnitId ? businessUnitName(item.businessUnitId) : ''}</td>
              <td>{uomName(item.stockUomId)}</td>
              <td>
                {item.retailPricePaisa !== null
                  ? Money.format(Money.of(item.retailPricePaisa))
                  : ''}
              </td>
              <td>{item.trackStock ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
