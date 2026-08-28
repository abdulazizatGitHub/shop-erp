import { useRef, useState } from 'react';
import type { CreatePurchaseInput, ItemDto, SupplierDto } from '@shop/contracts';
import { Money, Qty } from '@shop/shared';
import { ipc } from '../../lib/ipc.js';
import { CartTable, lineTotalPaisa, type CartLine } from '../sales/CartTable.js';
import { SearchSelect } from '../sales/SearchSelect.js';

type PaymentMode = 'cash' | 'credit';

/**
 * PG-D: the field list this UI builds intentionally omits
 * supplierInvoiceNo/billReference/dueDate/billNotes/notes (not in the
 * PG-D spec) — CreatePurchaseInput requires them, so they're sent as
 * null. A credit purchase's party_ledger row therefore carries no bill
 * metadata from this screen. Flagged for PROJECT.md, not fixed here.
 */
interface SessionPurchaseRecord {
  readonly docNo: string;
  readonly supplierName: string;
  readonly paymentMode: PaymentMode;
  readonly totalAmountPaisa: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PurchasePage(): React.JSX.Element {
  const [supplier, setSupplier] = useState<SupplierDto | null>(null);
  const [purchaseDate, setPurchaseDate] = useState(todayIso());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('credit');
  const [lines, setLines] = useState<readonly CartLine[]>([]);
  const [pendingItem, setPendingItem] = useState<ItemDto | null>(null);
  const [qtyInput, setQtyInput] = useState('1');
  const [unitCostInput, setUnitCostInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sessionPurchases, setSessionPurchases] = useState<readonly SessionPurchaseRecord[]>([]);

  const itemSearchRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const unitCostRef = useRef<HTMLInputElement>(null);

  const subtotalPaisa = Money.sum(lines.map((line) => Money.of(lineTotalPaisa(line) ?? 0)));

  function resetLineEntry(): void {
    setPendingItem(null);
    setQtyInput('1');
    setUnitCostInput('');
  }

  function addLine(): void {
    if (!pendingItem) return;
    let quantityMilli: number;
    try {
      quantityMilli = Qty.fromUnits(qtyInput);
    } catch {
      setError('Quantity is not a valid amount');
      return;
    }
    if (quantityMilli <= 0) {
      setError('Quantity must be greater than zero');
      return;
    }
    let unitCostPaisa: number;
    try {
      unitCostPaisa = Money.fromRupees(unitCostInput);
    } catch {
      setError('Unit cost is not a valid amount');
      return;
    }
    if (unitCostPaisa <= 0) {
      setError('Unit cost must be greater than zero');
      return;
    }
    setError(null);
    setLines((prev) => [
      ...prev,
      {
        itemId: pendingItem.id,
        itemLabel: pendingItem.nameEn,
        quantityMilli,
        unitPricePaisa: unitCostPaisa,
        unitLabel: '',
      },
    ]);
    resetLineEntry();
    itemSearchRef.current?.focus();
  }

  function removeLine(index: number): void {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(): Promise<void> {
    setError(null);
    if (!supplier) {
      setError('Select a supplier first');
      return;
    }
    if (lines.length === 0) {
      setError('Add at least one line');
      return;
    }
    const input: CreatePurchaseInput = {
      supplierId: supplier.id,
      warehouseId: null,
      purchaseDate,
      supplierInvoiceNo: null,
      paymentMode,
      billReference: null,
      dueDate: null,
      billNotes: null,
      notes: null,
      lines: lines.map((line) => ({
        itemId: line.itemId,
        quantityMilli: line.quantityMilli,
        unitCostPaisa: line.unitPricePaisa ?? 0,
        notes: null,
      })),
    };
    try {
      const result = await ipc.purchase.create(input);
      setSuccessMessage(
        `Purchase ${result.docNo} — ${Money.format(Money.of(result.totalAmountPaisa))}`,
      );
      setSessionPurchases((prev) => [
        {
          docNo: result.docNo,
          supplierName: supplier.name,
          paymentMode,
          totalAmountPaisa: result.totalAmountPaisa,
        },
        ...prev,
      ]);
      setSupplier(null);
      setPurchaseDate(todayIso());
      setPaymentMode('credit');
      setLines([]);
      resetLineEntry();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed');
    }
  }

  return (
    <div>
      <h1>New Purchase</h1>
      {error && <p role="alert">{error}</p>}
      {successMessage && <p role="status">{successMessage}</p>}

      <SearchSelect<SupplierDto>
        key="supplier-search"
        autoFocus
        placeholder="Search supplier"
        search={(query) => ipc.party.search({ query })}
        getKey={(s) => s.id}
        getLabel={(s) => (s.shopName ? `${s.name} — ${s.shopName}` : s.name)}
        onSelect={(s) => {
          setSupplier(s);
        }}
      />
      <p>Supplier: {supplier ? supplier.name : 'None selected'}</p>

      <label>
        Purchase date
        <input
          type="date"
          value={purchaseDate}
          onChange={(e) => {
            setPurchaseDate(e.target.value);
          }}
        />
      </label>

      <div
        tabIndex={0}
        role="radiogroup"
        aria-label="Payment mode"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            setPaymentMode((m) => (m === 'cash' ? 'credit' : 'cash'));
          }
        }}
      >
        <span role="radio" aria-checked={paymentMode === 'cash'}>
          {paymentMode === 'cash' ? '[x]' : '[ ]'} Cash
        </span>{' '}
        <span role="radio" aria-checked={paymentMode === 'credit'}>
          {paymentMode === 'credit' ? '[x]' : '[ ]'} Credit
        </span>
      </div>

      <hr />
      <h2>Lines</h2>
      {!pendingItem && (
        <SearchSelect<ItemDto>
          key="item-search"
          inputRef={itemSearchRef}
          placeholder="Search item"
          search={(query) => ipc.item.search({ query, categoryId: null })}
          getKey={(item) => item.id}
          getLabel={(item) => `${item.nameEn} (${item.itemCode})`}
          onSelect={(item) => {
            setPendingItem(item);
            setQtyInput('1');
            setUnitCostInput('');
          }}
        />
      )}
      {pendingItem && (
        <div>
          <p>{pendingItem.nameEn} — quantity (stock unit)?</p>
          <input
            ref={qtyRef}
            autoFocus
            inputMode="decimal"
            value={qtyInput}
            onChange={(e) => {
              setQtyInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                unitCostRef.current?.focus();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                resetLineEntry();
              }
            }}
          />
          <label>
            Unit cost (Rs)
            <input
              ref={unitCostRef}
              inputMode="decimal"
              value={unitCostInput}
              onChange={(e) => {
                setUnitCostInput(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addLine();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  resetLineEntry();
                }
              }}
            />
          </label>
          <button type="button" onClick={addLine}>
            Add Line
          </button>
        </div>
      )}

      <CartTable cart={lines} subtotalPaisa={subtotalPaisa} onRemove={removeLine} />

      <button
        type="button"
        disabled={!supplier || lines.length === 0}
        onClick={() => {
          void handleSubmit();
        }}
      >
        Submit Purchase
      </button>

      <hr />
      <h2>Purchases this session</h2>
      {sessionPurchases.length === 0 ? (
        <p>None yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Doc No</th>
              <th>Supplier</th>
              <th>Payment</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {sessionPurchases.map((p) => (
              <tr key={p.docNo}>
                <td>{p.docNo}</td>
                <td>{p.supplierName}</td>
                <td>{p.paymentMode}</td>
                <td>{Money.format(Money.of(p.totalAmountPaisa))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
