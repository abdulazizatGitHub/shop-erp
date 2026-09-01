import { useEffect, useRef, useState } from 'react';
import type {
  CreatePurchaseInput,
  ItemDto,
  ItemLookups,
  PurchaseListRowDto,
  SupplierDto,
} from '@shop/contracts';
import { Money, Qty } from '@shop/shared';
import { Alert, Button, Card, LoadingState, Modal, PageHeader, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { CartTable, lineTotalPaisa, type CartLine } from '../sales/CartTable.js';
import { SearchSelect } from '../sales/SearchSelect.js';
import { PurchaseListTable } from './PurchaseListTable.js';

type PaymentMode = 'cash' | 'credit';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PurchasePage(): React.JSX.Element {
  const [lookups, setLookups] = useState<ItemLookups | null>(null);
  const [newPurchaseOpen, setNewPurchaseOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [supplier, setSupplier] = useState<SupplierDto | null>(null);
  const [purchaseDate, setPurchaseDate] = useState(todayIso());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('credit');
  const [lines, setLines] = useState<readonly CartLine[]>([]);
  const [pendingItem, setPendingItem] = useState<ItemDto | null>(null);
  const [qtyInput, setQtyInput] = useState('1');
  const [unitCostInput, setUnitCostInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<readonly PurchaseListRowDto[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const itemSearchRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const unitCostRef = useRef<HTMLInputElement>(null);
  const paymentModeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ipc.item
      .lookups()
      .then(setLookups)
      .catch(() => {
        // Unit-name display degrades to raw uom ids; not fatal to purchasing.
      });
  }, []);

  // Step 2's item search is the natural first stop when the line-entry
  // page appears, same way step 1's supplier search auto-focuses on open.
  useEffect(() => {
    if (newPurchaseOpen && step === 2 && !pendingItem) {
      itemSearchRef.current?.focus();
    }
  }, [newPurchaseOpen, step, pendingItem]);

  function loadPurchases(): void {
    ipc.purchase
      .list({ limit: 100 })
      .then((rows) => {
        setPurchases(rows);
        setListError(null);
      })
      .catch((err: unknown) => {
        setListError(err instanceof Error ? err.message : 'Failed to load purchases');
      });
  }

  useEffect(() => {
    loadPurchases();
  }, []);

  function handleCancel(id: string): void {
    setCancellingId(id);
    ipc.purchase
      .cancel({ id })
      .then(() => {
        loadPurchases();
      })
      .catch((err: unknown) => {
        setListError(err instanceof Error ? err.message : 'Failed to cancel purchase');
      })
      .finally(() => {
        setCancellingId(null);
      });
  }

  const uomName = (id: string): string => lookups?.uoms.find((u) => u.id === id)?.name ?? id;

  const subtotalPaisa = Money.sum(lines.map((line) => Money.of(lineTotalPaisa(line) ?? 0)));

  function resetLineEntry(): void {
    setPendingItem(null);
    setQtyInput('1');
    setUnitCostInput('');
  }

  function resetPurchaseForm(): void {
    setSupplier(null);
    setPurchaseDate(todayIso());
    setPaymentMode('credit');
    setLines([]);
    resetLineEntry();
    setError(null);
    setStep(1);
  }

  function openNewPurchase(): void {
    resetPurchaseForm();
    setNewPurchaseOpen(true);
  }

  function closeNewPurchase(): void {
    setNewPurchaseOpen(false);
    resetPurchaseForm();
  }

  function goToLines(): void {
    if (!supplier) {
      setError('Select a supplier first');
      return;
    }
    setError(null);
    setStep(2);
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
        // P4.5-5: was always '' before this redesign — CartTable's Unit
        // column would render blank. Fixed using the same item:lookups
        // call Sales/Items already make (not a new IPC channel).
        unitLabel: uomName(pendingItem.stockUomId),
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
    // BUG-16: supplierInvoiceNo/bill fields always
    // null — not collected in this screen.
    // See PROJECT.md for context.
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
      setNewPurchaseOpen(false);
      resetPurchaseForm();
      setSuccessMessage(
        `Purchase ${result.docNo} — ${Money.format(Money.of(result.totalAmountPaisa))}`,
      );
      loadPurchases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Purchases"
        actions={
          <Button variant="primary" onClick={openNewPurchase}>
            New Purchase
          </Button>
        }
      />
      {successMessage && <Alert variant="success">{successMessage}</Alert>}

      <Modal
        open={newPurchaseOpen}
        title={`New Purchase — Step ${String(step)} of 2`}
        onClose={closeNewPurchase}
        size="wide"
      >
        <div className="flex flex-col gap-4">
          {error && <Alert variant="danger">{error}</Alert>}

          {step === 1 ? (
            <>
              <div>
                <p className="mb-1 text-sm font-medium text-ink-muted">Supplier</p>
                <SearchSelect<SupplierDto>
                  key="supplier-search"
                  autoFocus
                  placeholder="Search supplier"
                  search={(query) => ipc.party.search({ query })}
                  getKey={(s) => s.id}
                  getLabel={(s) => (s.shopName ? `${s.name} — ${s.shopName}` : s.name)}
                  onSelect={(s) => {
                    setSupplier(s);
                    paymentModeRef.current?.focus();
                  }}
                />
                <p
                  className={`mt-2 text-lg font-semibold ${supplier ? 'text-ink' : 'text-ink-faint'}`}
                >
                  {supplier ? supplier.name : 'None selected'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1 text-sm text-ink-muted">
                  Purchase date
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => {
                      setPurchaseDate(e.target.value);
                    }}
                    className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
                  />
                </label>
                <div>
                  <p className="mb-1 text-sm font-medium text-ink-muted">Payment mode</p>
                  <div
                    ref={paymentModeRef}
                    tabIndex={0}
                    role="radiogroup"
                    aria-label="Payment mode"
                    onKeyDown={(e) => {
                      if (e.key === 'c' || e.key === 'C') {
                        setPaymentMode('cash');
                      } else if (e.key === 'r' || e.key === 'R') {
                        setPaymentMode('credit');
                      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        setPaymentMode((m) => (m === 'cash' ? 'credit' : 'cash'));
                      }
                    }}
                    className="grid grid-cols-2 gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {/* tabIndex=-1: mouse-clickable, but the radiogroup div above
                        stays the sole keyboard-focusable stop (same pattern as
                        the Sales screen's Cash/Udhaar toggle). */}
                    <button
                      type="button"
                      tabIndex={-1}
                      role="radio"
                      aria-checked={paymentMode === 'cash'}
                      onClick={() => {
                        setPaymentMode('cash');
                      }}
                      className={`rounded-md border px-4 py-3 text-base font-medium transition-colors ${
                        paymentMode === 'cash'
                          ? 'border-brand bg-brand text-white'
                          : 'border-line bg-surface text-ink hover:bg-surface-sunken'
                      }`}
                    >
                      Cash (C)
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      role="radio"
                      aria-checked={paymentMode === 'credit'}
                      onClick={() => {
                        setPaymentMode('credit');
                      }}
                      className={`rounded-md border px-4 py-3 text-base font-medium transition-colors ${
                        paymentMode === 'credit'
                          ? 'border-brand bg-brand text-white'
                          : 'border-line bg-surface text-ink hover:bg-surface-sunken'
                      }`}
                    >
                      Credit (R)
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={closeNewPurchase}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={goToLines}>
                  Next
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="border-t border-line pt-4">
                <p className="mb-2 text-sm font-medium text-ink-muted">Add line</p>
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
                    renderItem={(item) => (
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{item.nameEn}</p>
                          <p className="text-xs text-ink-faint">{item.itemCode}</p>
                        </div>
                        <p className="shrink-0 text-xs text-ink-faint">
                          {uomName(item.stockUomId)}
                        </p>
                      </div>
                    )}
                  />
                )}
                {pendingItem && (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-ink">
                      {pendingItem.nameEn} — quantity (stock unit)?
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <TextInput
                        ref={qtyRef}
                        label="Quantity"
                        autoFocus
                        variant="number"
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
                      <TextInput
                        ref={unitCostRef}
                        label="Unit cost (Rs)"
                        variant="number"
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
                    </div>
                    <div>
                      <Button variant="secondary" onClick={addLine}>
                        Add line
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <CartTable cart={lines} subtotalPaisa={subtotalPaisa} onRemove={removeLine} />

              <div className="flex justify-between gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStep(1);
                  }}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="large"
                  disabled={lines.length === 0}
                  onClick={() => {
                    void handleSubmit();
                  }}
                >
                  Record Purchase
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Card title="Purchases">
        {listError && <Alert variant="danger">{listError}</Alert>}
        {purchases === null ? (
          <LoadingState message="Loading purchases…" />
        ) : (
          <PurchaseListTable
            purchases={purchases}
            cancellingId={cancellingId}
            onCancel={handleCancel}
          />
        )}
      </Card>
    </div>
  );
}
