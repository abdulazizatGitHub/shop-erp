import { useEffect, useRef, useState } from 'react';
import type { ItemDto, ItemLookups, SupplierDto } from '@shop/contracts';
import { Qty } from '@shop/shared';
import { Alert, Modal } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { NewPoStep1 } from './NewPoStep1.js';
import { NewPoStep2 } from './NewPoStep2.js';
import type { PoLine } from './PoLinesTable.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface NewPoModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: (docNo: string) => void;
}

export function NewPoModal({ open, onClose, onCreated }: NewPoModalProps): React.JSX.Element {
  const [lookups, setLookups] = useState<ItemLookups | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [supplier, setSupplier] = useState<SupplierDto | null>(null);
  const [supplierNote, setSupplierNote] = useState('');
  const [orderDate, setOrderDate] = useState(todayIso());
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<readonly PoLine[]>([]);
  const [pendingItem, setPendingItem] = useState<ItemDto | null>(null);
  const [qtyInput, setQtyInput] = useState('1');
  const [lineNotesInput, setLineNotesInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const itemSearchRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ipc.item
      .lookups()
      .then(setLookups)
      .catch(() => {
        // Unit-name display degrades to raw uom ids; not fatal to ordering.
      });
  }, []);

  useEffect(() => {
    if (open && step === 2 && !pendingItem) {
      itemSearchRef.current?.focus();
    }
  }, [open, step, pendingItem]);

  function resetForm(): void {
    setStep(1);
    setSupplier(null);
    setSupplierNote('');
    setOrderDate(todayIso());
    setExpectedDelivery('');
    setNotes('');
    setLines([]);
    setPendingItem(null);
    setQtyInput('1');
    setLineNotesInput('');
    setError(null);
  }

  function handleClose(): void {
    onClose();
    resetForm();
  }

  function goToLines(): void {
    if (!supplier && supplierNote.trim().length === 0) {
      setError('Select a supplier or enter a supplier note');
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
    setError(null);
    const existing = lines.find((l) => l.itemId === pendingItem.id);
    if (existing) {
      setLines((prev) =>
        prev.map((l) =>
          l.itemId === pendingItem.id ? { ...l, quantityMilli: l.quantityMilli + 1000 } : l,
        ),
      );
    } else {
      setLines((prev) => [
        ...prev,
        {
          itemId: pendingItem.id,
          itemLabel: pendingItem.nameEn,
          unitLabel:
            lookups?.uoms.find((u) => u.id === pendingItem.stockUomId)?.name ??
            pendingItem.stockUomId,
          quantityMilli,
          notes: lineNotesInput.trim().length > 0 ? lineNotesInput.trim() : null,
        },
      ]);
    }
    setPendingItem(null);
    setQtyInput('1');
    setLineNotesInput('');
    itemSearchRef.current?.focus();
  }

  function removeLine(index: number): void {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(): Promise<void> {
    setError(null);
    if (lines.length === 0) {
      setError('Add at least one line');
      return;
    }
    setSubmitting(true);
    try {
      const result = await ipc.purchaseOrder.create({
        supplierPartyId: supplier?.id ?? null,
        supplierNote: supplier ? null : supplierNote.trim() || null,
        orderDate,
        expectedDelivery: expectedDelivery || null,
        notes: notes.trim() || null,
        lines: lines.map((line) => ({
          itemId: line.itemId,
          quantityOrderedMilli: line.quantityMilli,
          notes: line.notes,
        })),
      });
      onCreated(result.docNo);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create purchase order');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`New Purchase Order — Step ${String(step)} of 2`}
      onClose={handleClose}
      size="wide"
    >
      <div className="flex flex-col gap-4">
        {error && <Alert variant="danger">{error}</Alert>}

        {step === 1 ? (
          <NewPoStep1
            supplier={supplier}
            onSelectSupplier={(s) => {
              setSupplier(s);
              setSupplierNote('');
            }}
            supplierNote={supplierNote}
            onSupplierNoteChange={setSupplierNote}
            orderDate={orderDate}
            onOrderDateChange={setOrderDate}
            expectedDelivery={expectedDelivery}
            onExpectedDeliveryChange={setExpectedDelivery}
            notes={notes}
            onNotesChange={setNotes}
            onCancel={handleClose}
            onNext={goToLines}
          />
        ) : (
          <NewPoStep2
            lookups={lookups}
            itemSearchRef={itemSearchRef}
            qtyRef={qtyRef}
            pendingItem={pendingItem}
            onSelectItem={(item) => {
              setPendingItem(item);
              setQtyInput('1');
              setLineNotesInput('');
            }}
            qtyInput={qtyInput}
            onQtyInputChange={setQtyInput}
            lineNotesInput={lineNotesInput}
            onLineNotesInputChange={setLineNotesInput}
            onAddLine={addLine}
            onCancelPendingItem={() => {
              setPendingItem(null);
            }}
            lines={lines}
            onRemoveLine={removeLine}
            onBack={() => {
              setStep(1);
            }}
            onSubmit={() => {
              void handleSubmit();
            }}
            submitting={submitting}
          />
        )}
      </div>
    </Modal>
  );
}
