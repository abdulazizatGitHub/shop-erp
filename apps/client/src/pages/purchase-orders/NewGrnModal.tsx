import { useEffect, useMemo, useState } from 'react';
import type { ItemDto, ItemLookups } from '@shop/contracts';
import { Money, Qty } from '@shop/shared';
import { Alert, Button, Modal } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import type { PurchaseOrderRecord } from '../../types/electron-api.js';
import { GrnLinesEditor } from './GrnLinesEditor.js';
import type { GrnLineEntry } from './grnLines.js';
import { validateReceivingNow } from './grnLines.js';
import type { PaymentMode } from './NewGrnStep1.js';
import { NewGrnStep1 } from './NewGrnStep1.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface NewGrnModalProps {
  readonly open: boolean;
  readonly po: PurchaseOrderRecord | null;
  readonly onClose: () => void;
  readonly onCreated: (docNo: string) => void;
}

/**
 * Converts one line's Rupee-string inputs to paisa. The single place this
 * happens — both the submit handler and the live subtotal preview call
 * this same function, so there is exactly one Rs->paisa conversion path
 * to audit, not two that could drift apart.
 */
function convertLineMoney(
  line: GrnLineEntry,
): { unitCostPaisa: number; sellingPricePaisa: number; wholesalePricePaisa: number | null } | null {
  if (line.unitCostInput.trim() === '' || line.sellingPriceInput.trim() === '') return null;
  try {
    // e.g. user enters "350" Rs -> Money.fromRupees rounds half-up to 35000 paisa.
    // "350.5" Rs -> 35050 paisa (never truncated). Same rule for selling/wholesale price.
    const unitCostPaisa = Money.fromRupees(line.unitCostInput);
    const sellingPricePaisa = Money.fromRupees(line.sellingPriceInput);
    const wholesalePricePaisa =
      line.wholesalePriceInput.trim() === '' ? null : Money.fromRupees(line.wholesalePriceInput);
    if (unitCostPaisa <= 0 || sellingPricePaisa <= 0) return null;
    return { unitCostPaisa, sellingPricePaisa, wholesalePricePaisa };
  } catch {
    return null;
  }
}

function receivingNowMilli(line: GrnLineEntry): number {
  try {
    return Qty.fromUnits(line.receivingNowInput || '0');
  } catch {
    return 0;
  }
}

export function NewGrnModal({ open, po, onClose, onCreated }: NewGrnModalProps): React.JSX.Element {
  const [lookups, setLookups] = useState<ItemLookups | null>(null);
  const [items, setItems] = useState<readonly ItemDto[] | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [grnDate, setGrnDate] = useState(todayIso());
  const [supplierBillRef, setSupplierBillRef] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<readonly GrnLineEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    ipc.item
      .lookups()
      .then(setLookups)
      .catch(() => {
        setLookups(null);
      });
    ipc.item
      .search({ query: '', categoryId: null })
      .then(setItems)
      .catch(() => {
        setItems(null);
      });
  }, [open]);

  // Pre-fills PO lines still owed a receipt, once items/lookups (for name/uom
  // resolution — PurchaseOrderLineRecord itself carries only itemId) are
  // available. Single effect, all three dependencies, so there is no
  // multi-step patch race between name resolution and the initial fill.
  useEffect(() => {
    if (!open || !po || !items || !lookups) return;
    setStep(1);
    setGrnDate(todayIso());
    setSupplierBillRef('');
    setPaymentMode('cash');
    setNotes('');
    setError(null);
    const itemById = new Map(items.map((i) => [i.id, i]));
    const uomNameById = new Map(lookups.uoms.map((u) => [u.id, u.name]));
    setLines(
      po.lines
        .filter((l) => l.quantityOrderedMilli - l.quantityReceivedMilli > 0)
        .map((l) => {
          const item = itemById.get(l.itemId);
          return {
            purchaseOrderLineId: l.id,
            itemId: l.itemId,
            itemLabel: item?.nameEn ?? l.itemId,
            unitLabel: item ? (uomNameById.get(item.stockUomId) ?? item.stockUomId) : '',
            orderedMilli: l.quantityOrderedMilli,
            alreadyReceivedMilli: l.quantityReceivedMilli,
            receivingNowInput: Qty.format(Qty.of(l.quantityOrderedMilli - l.quantityReceivedMilli)),
            unitCostInput: '',
            sellingPriceInput: '',
            wholesalePriceInput: '',
          };
        }),
    );
  }, [open, po, items, lookups]);

  const subtotalPaisa = useMemo(() => {
    return lines.reduce((sum, line) => {
      const qtyMilli = receivingNowMilli(line);
      if (qtyMilli <= 0) return sum;
      const money = convertLineMoney(line);
      if (!money) return sum;
      return sum + Money.multiplyByQuantity(Money.of(money.unitCostPaisa), qtyMilli);
    }, 0);
  }, [lines]);

  function handleClose(): void {
    onClose();
  }

  function goToLines(): void {
    setError(null);
    setStep(2);
  }

  function updateLine(index: number, patch: Partial<GrnLineEntry>): void {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function removeUnplannedLine(index: number): void {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(): Promise<void> {
    setError(null);
    if (!po) return;

    const includedLines = lines.filter((line) => receivingNowMilli(line) > 0);
    if (includedLines.length === 0) {
      setError('Enter a quantity for at least one line');
      return;
    }

    // Defensive re-check (b): the same cap the inline field already enforces (a).
    for (const line of includedLines) {
      const lineError = validateReceivingNow(line);
      if (lineError) {
        setError(`${line.itemLabel}: ${lineError}`);
        return;
      }
    }

    const convertedLines: {
      purchaseOrderLineId: string | null;
      itemId: string;
      quantityReceivedMilli: number;
      unitCostPaisa: number;
      sellingPricePaisa: number;
      wholesalePricePaisa: number | null;
    }[] = [];
    for (const line of includedLines) {
      const money = convertLineMoney(line);
      if (!money) {
        setError(`${line.itemLabel}: unit cost and selling price are required`);
        return;
      }
      convertedLines.push({
        purchaseOrderLineId: line.purchaseOrderLineId,
        itemId: line.itemId,
        quantityReceivedMilli: receivingNowMilli(line),
        unitCostPaisa: money.unitCostPaisa,
        sellingPricePaisa: money.sellingPricePaisa,
        wholesalePricePaisa: money.wholesalePricePaisa,
      });
    }

    setSubmitting(true);
    try {
      const result = await ipc.grn.create({
        purchaseOrderId: po.id,
        supplierPartyId: po.supplierPartyId,
        supplierBillRef: supplierBillRef.trim() || null,
        grnDate,
        paymentMode,
        notes: notes.trim() || null,
        lines: convertedLines,
      });
      onCreated(result.docNo);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create GRN');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`New GRN — Step ${String(step)} of 2`}
      onClose={handleClose}
      size="wide"
    >
      <div className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}

        {step === 1 ? (
          <NewGrnStep1
            grnDate={grnDate}
            onGrnDateChange={setGrnDate}
            supplierBillRef={supplierBillRef}
            onSupplierBillRefChange={setSupplierBillRef}
            paymentMode={paymentMode}
            onPaymentModeChange={setPaymentMode}
            notes={notes}
            onNotesChange={setNotes}
            creditBlockedNoSupplier={!po?.supplierPartyId}
            onCancel={handleClose}
            onNext={goToLines}
          />
        ) : (
          <>
            <GrnLinesEditor
              lines={lines}
              onChangeLine={updateLine}
              onAddUnplannedLine={(line) => {
                setLines((prev) => [...prev, line]);
              }}
              onRemoveUnplannedLine={removeUnplannedLine}
              lookups={lookups}
              subtotalPaisa={subtotalPaisa}
            />
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
                disabled={submitting}
                onClick={() => {
                  void handleSubmit();
                }}
              >
                Record GRN
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
