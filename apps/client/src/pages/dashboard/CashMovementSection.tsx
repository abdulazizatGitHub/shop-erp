import { useEffect, useState } from 'react';
import type { CashMovementDto, CashMovementType } from '@shop/contracts';
import { Alert, Button, MoneyDisplay, Select, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

const TYPE_LABELS: Record<CashMovementType, string> = {
  bank_deposit: 'Bank deposit',
  owner_draw: 'Owner draw',
  float_add: 'Float added',
  other: 'Other',
};

interface CashMovementSectionProps {
  readonly sessionDate: string;
}

// Phase 17.5 (docs/phases/PHASE_17_5.md), Task 5/6, BUG-31. Rupee input is
// parsed with Math.round(Number(...) * 100) rather than Money.fromRupees —
// that helper doesn't exist on @shop/shared's Money; amounts here are signed
// by movement type before being sent (0021_cash_movement.sql stores the
// sign, ADR-0016 §2.5).
function parseRupeesToPaisa(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const rupees = Number(trimmed);
  if (!Number.isFinite(rupees) || rupees <= 0) return null;
  return Math.round(rupees * 100);
}

export function CashMovementSection({ sessionDate }: CashMovementSectionProps): React.JSX.Element {
  const [movements, setMovements] = useState<readonly CashMovementDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [movementType, setMovementType] = useState<CashMovementType>('bank_deposit');
  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const [amountInput, setAmountInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reversalNote, setReversalNote] = useState('');

  function load(): void {
    ipc.cashMovement
      .listForDateRange({ dateFrom: sessionDate, dateTo: sessionDate })
      .then(setMovements)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load cash movements');
      });
  }

  useEffect(() => {
    load();
  }, [sessionDate]);

  function resetForm(): void {
    setAmountInput('');
    setNoteInput('');
    setMovementType('bank_deposit');
    setDirection('out');
    setFormOpen(false);
  }

  async function handleRecord(): Promise<void> {
    setError(null);
    const amountPaisaAbs = parseRupeesToPaisa(amountInput);
    if (amountPaisaAbs === null) {
      setError('Enter a valid amount');
      return;
    }
    if (noteInput.trim().length === 0) {
      setError('A note is required for every cash movement.');
      return;
    }
    const sign =
      movementType === 'float_add'
        ? 1
        : movementType === 'other'
          ? direction === 'in'
            ? 1
            : -1
          : -1;
    setBusy(true);
    try {
      await ipc.cashMovement.record({
        movementType,
        amountPaisa: sign * amountPaisaAbs,
        note: noteInput.trim(),
      });
      resetForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record cash movement');
    } finally {
      setBusy(false);
    }
  }

  async function handleReverse(originalId: string): Promise<void> {
    setError(null);
    if (reversalNote.trim().length === 0) {
      setError('A note is required for every cash movement.');
      return;
    }
    setBusy(true);
    try {
      await ipc.cashMovement.reverse({ originalId, note: reversalNote.trim() });
      setReversingId(null);
      setReversalNote('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reverse cash movement');
    } finally {
      setBusy(false);
    }
  }

  const reversedIds = new Set(
    (movements ?? []).filter((m) => m.reversesId !== null).map((m) => m.reversesId as string),
  );

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      {error && <Alert variant="danger">{error}</Alert>}

      {!formOpen ? (
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setFormOpen(true);
            }}
          >
            Cash In / Cash Out
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Select
            label="Reason"
            value={movementType}
            onChange={(e) => {
              setMovementType(e.target.value as CashMovementType);
            }}
          >
            <option value="bank_deposit">Bank deposit</option>
            <option value="owner_draw">Owner draw</option>
            <option value="float_add">Float added</option>
            <option value="other">Other</option>
          </Select>
          {movementType === 'other' && (
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  type="radio"
                  name="cash-movement-direction"
                  checked={direction === 'in'}
                  onChange={() => {
                    setDirection('in');
                  }}
                />
                Cash In
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  type="radio"
                  name="cash-movement-direction"
                  checked={direction === 'out'}
                  onChange={() => {
                    setDirection('out');
                  }}
                />
                Cash Out
              </label>
            </div>
          )}
          <TextInput
            label="Amount (Rs)"
            variant="number"
            value={amountInput}
            onChange={(e) => {
              setAmountInput(e.target.value);
            }}
          />
          <TextInput
            label="Note"
            value={noteInput}
            onChange={(e) => {
              setNoteInput(e.target.value);
            }}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy || noteInput.trim().length === 0}
              onClick={() => {
                void handleRecord();
              }}
            >
              Record
            </Button>
          </div>
        </div>
      )}

      {movements && movements.length > 0 && (
        <div className="flex flex-col gap-2">
          {movements.map((m) => {
            const original = m.reversesId
              ? movements.find((o) => o.id === m.reversesId)
              : undefined;
            const description = original
              ? `Correction of ${original.docNo}`
              : TYPE_LABELS[m.movementType];
            const alreadyReversed = reversedIds.has(m.id);
            const isReversal = m.reversesId !== null;
            return (
              <div key={m.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex-1">
                  <span className="font-mono text-xs text-ink-faint">{m.docNo}</span>{' '}
                  <span className="text-ink">{description}</span>
                  <p className="text-xs text-ink-faint">{m.note}</p>
                </div>
                <MoneyDisplay paisaValue={m.amountPaisa} tone={m.amountPaisa < 0 ? 'out' : 'in'} />
                {reversingId === m.id ? (
                  <div className="flex items-center gap-2">
                    <TextInput
                      value={reversalNote}
                      placeholder="Reason for correction"
                      onChange={(e) => {
                        setReversalNote(e.target.value);
                      }}
                    />
                    <Button
                      variant="primary"
                      disabled={busy || reversalNote.trim().length === 0}
                      onClick={() => {
                        void handleReverse(m.id);
                      }}
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setReversingId(null);
                        setReversalNote('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={alreadyReversed || isReversal}
                    onClick={() => {
                      setReversingId(m.id);
                    }}
                  >
                    Reverse
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-ink-faint">
        Movements are not tied to a login until the auth phase.
      </p>
    </div>
  );
}
