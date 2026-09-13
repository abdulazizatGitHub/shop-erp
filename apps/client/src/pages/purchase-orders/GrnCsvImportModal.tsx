import { useEffect, useRef, useState } from 'react';
import type { ItemDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { Modal } from '@shop/ui';
import { downloadCsvRows } from '../../lib/downloadCsv.js';
import { ipc } from '../../lib/ipc.js';
import type { PurchaseOrderRecord } from '../../types/electron-api.js';
import { GRN_CSV_COLUMNS, parseGrnCsv } from './grnCsvParse.js';
import { GrnCsvStep1 } from './GrnCsvStep1.js';
import { GrnCsvStep2 } from './GrnCsvStep2.js';
import type { GrnCsvStepState } from './GrnCsvStep2.js';
import { GrnCsvStep3 } from './GrnCsvStep3.js';
import type { PaymentMode } from './NewGrnStep1.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface GrnCsvImportModalProps {
  readonly open: boolean;
  readonly po: PurchaseOrderRecord | null;
  readonly onClose: () => void;
  readonly onCreated: (docNo: string) => void;
}

export function GrnCsvImportModal({
  open,
  po,
  onClose,
  onCreated,
}: GrnCsvImportModalProps): React.JSX.Element {
  const [items, setItems] = useState<readonly ItemDto[] | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [grnDate, setGrnDate] = useState(todayIso());
  const [supplierBillRef, setSupplierBillRef] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [csvState, setCsvState] = useState<GrnCsvStepState>({ status: 'idle' });
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    ipc.item
      .search({ query: '', categoryId: null })
      .then(setItems)
      .catch(() => {
        setItems(null);
      });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setGrnDate(todayIso());
    setSupplierBillRef('');
    setPaymentMode('cash');
    setCsvState({ status: 'idle' });
    setConfirmError(null);
  }, [open, po]);

  function handleClose(): void {
    onClose();
  }

  function handleSelectClick(): void {
    fileInputRef.current?.click();
  }

  function handleDownloadTemplate(): void {
    if (!po || !items) return;
    const itemById = new Map(items.map((i) => [i.id, i]));
    const rows = po.lines
      .filter((l) => l.quantityOrderedMilli - l.quantityReceivedMilli > 0)
      .map((l) => {
        const item = itemById.get(l.itemId);
        const remainingMilli = l.quantityOrderedMilli - l.quantityReceivedMilli;
        // -> decimal, trailing zeros stripped (e.g. 13600 milli -> "13.6")
        const remainingUnits = (remainingMilli / 1000).toString();
        return [item?.itemCode ?? '', remainingUnits, '', '', '', ''];
      });
    downloadCsvRows(`grn-template-${po.docNo}.csv`, GRN_CSV_COLUMNS, rows);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file || !po) return;
    setCsvState({ status: 'validating', filename: file.name });
    file
      .text()
      .then((text) => {
        const parsed = parseGrnCsv(text);
        if (!parsed.ok) {
          setCsvState({ status: 'error', filename: file.name, fileError: parsed.fileError });
          return;
        }
        return ipc.grn
          .csvDryRun({ purchaseOrderId: po.id, rows: [...parsed.rows] })
          .then((result) => {
            setCsvState({
              status: 'ready',
              filename: file.name,
              accepted: result.accepted,
              rejected: result.rejected,
            });
          })
          .catch((err: unknown) => {
            setCsvState({
              status: 'dryRunFailed',
              filename: file.name,
              error: err instanceof Error ? err.message : 'Validation failed',
            });
          });
      })
      .catch(() => {
        setCsvState({
          status: 'error',
          filename: file.name,
          fileError: 'Could not read the file.',
        });
      });
  }

  function goToConfirm(): void {
    if (csvState.status !== 'ready' || csvState.accepted.length === 0) return;
    setConfirmError(null);
    setStep(3);
  }

  async function handleConfirm(): Promise<void> {
    if (!po || csvState.status !== 'ready') return;
    setConfirmError(null);
    setSubmitting(true);
    try {
      const result = await ipc.grn.create({
        purchaseOrderId: po.id,
        supplierPartyId: po.supplierPartyId,
        supplierBillRef: supplierBillRef.trim() || null,
        grnDate,
        paymentMode,
        notes: null,
        lines: csvState.accepted.map((row) => ({
          purchaseOrderLineId: row.purchaseOrderLineId,
          itemId: row.itemId,
          quantityReceivedMilli: row.quantityReceivedMilli,
          unitCostPaisa: row.unitCostPaisa,
          sellingPricePaisa: row.sellingPricePaisa,
          wholesalePricePaisa: row.wholesalePricePaisa,
        })),
      });
      onCreated(result.docNo);
      handleClose();
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Failed to record GRN');
    } finally {
      setSubmitting(false);
    }
  }

  const accepted = csvState.status === 'ready' ? csvState.accepted : [];
  // Total value = sum of each line's qty x unit cost, in paisa. Example
  // (first accepted line, if any): say ITM-0001, quantityReceivedMilli=2000,
  // unitCostPaisa=35000 (Rs 350.00/unit) ->
  // Money.multiplyByQuantity(35000, 2000) = Math.round(35000*2000/1000)
  //   = 70000 paisa = Rs 700 (2 units x Rs 350).
  const totalPaisa = Money.sum(
    accepted.map((row) =>
      Money.multiplyByQuantity(Money.of(row.unitCostPaisa), row.quantityReceivedMilli),
    ),
  );

  return (
    <Modal
      open={open}
      title={`Upload GRN CSV — Step ${String(step)} of 3`}
      onClose={handleClose}
      size="wide"
    >
      <div className="flex flex-col gap-4">
        {step === 1 && (
          <GrnCsvStep1
            grnDate={grnDate}
            onGrnDateChange={setGrnDate}
            supplierBillRef={supplierBillRef}
            onSupplierBillRefChange={setSupplierBillRef}
            paymentMode={paymentMode}
            onPaymentModeChange={setPaymentMode}
            onCancel={handleClose}
            onNext={() => {
              setStep(2);
            }}
          />
        )}
        {step === 2 && (
          <GrnCsvStep2
            state={csvState}
            fileInputRef={fileInputRef}
            onSelectClick={handleSelectClick}
            onFileChange={handleFileChange}
            onDownloadTemplate={handleDownloadTemplate}
            onBack={() => {
              setStep(1);
            }}
            onNext={goToConfirm}
          />
        )}
        {step === 3 && po && (
          <GrnCsvStep3
            poDocNo={po.docNo}
            grnDate={grnDate}
            supplierBillRef={supplierBillRef}
            paymentMode={paymentMode}
            accepted={accepted}
            totalPaisa={totalPaisa}
            error={confirmError}
            submitting={submitting}
            onBack={() => {
              setStep(2);
            }}
            onConfirm={() => {
              void handleConfirm();
            }}
          />
        )}
      </div>
    </Modal>
  );
}
