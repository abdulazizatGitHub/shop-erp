import { useEffect, useState } from 'react';
import type { CashSessionDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { Alert, Button, Card, MoneyDisplay, TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

type FormMode = 'none' | 'open' | 'close';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * PHASE_7.md §5 GAP-7/GAP-8/Correction 2 — dashboard widget, no new
 * route beyond the Dashboard page itself (there was no existing
 * dashboard/home page in this codebase to add to — owner decision:
 * add a new minimal Dashboard page/tab rather than touch SalePage.tsx,
 * a 580-line critical checkout flow, for an unrelated feature).
 * Variance is DISPLAY ONLY — stored at close time (Correction 2), never
 * auto-posted anywhere (GAP-8): no expense row, no party_ledger entry.
 */
export function CashSessionWidget(): React.JSX.Element {
  const [session, setSession] = useState<CashSessionDto | null | undefined>(undefined);
  const [mode, setMode] = useState<FormMode>('none');
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function loadToday(): void {
    ipc.cashSession
      .today()
      .then(setSession)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load cash session');
      });
  }

  useEffect(() => {
    loadToday();
  }, []);

  function openForm(next: FormMode): void {
    setAmountInput('');
    setError(null);
    setMode(next);
  }

  async function handleOpen(): Promise<void> {
    setError(null);
    let openingCash: number;
    try {
      openingCash = Money.fromRupees(amountInput);
    } catch {
      setError('Enter a valid amount');
      return;
    }
    setBusy(true);
    try {
      const result = await ipc.cashSession.open({
        date: new Date().toISOString().slice(0, 10),
        openingCash,
      });
      setSession(result);
      setMode('none');
    } catch (err) {
      // SESSION_ALREADY_OPEN crosses the IPC boundary as a typed
      // IpcHandlerError (apps/server/src/ipc/middleware/with-error.ts) —
      // never a raw SQLite error.
      const code = (err as { code?: string } | undefined)?.code;
      setError(
        code === 'SESSION_ALREADY_OPEN'
          ? 'A session is already open today.'
          : err instanceof Error
            ? err.message
            : 'Failed to open session',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(): Promise<void> {
    if (!session) return;
    setError(null);
    let countedCash: number;
    try {
      countedCash = Money.fromRupees(amountInput);
    } catch {
      setError('Enter a valid amount');
      return;
    }
    setBusy(true);
    try {
      const result = await ipc.cashSession.close({ sessionId: session.id, countedCash });
      setSession(result);
      setMode('none');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close session');
    } finally {
      setBusy(false);
    }
  }

  if (session === undefined) {
    return (
      <Card title="Cash Session">
        <p className="text-sm text-ink-faint">Loading…</p>
      </Card>
    );
  }

  // STATE 1 — no session today.
  if (session === null) {
    return (
      <Card title="Cash Session">
        <div className="flex flex-col gap-3">
          {error && <Alert variant="danger">{error}</Alert>}
          {mode === 'open' ? (
            <>
              <TextInput
                label="Opening float (Rs)"
                variant="number"
                autoFocus
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value);
                }}
              />
              <div className="flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setMode('none');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => {
                    void handleOpen();
                  }}
                >
                  Open
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-muted">Not started</p>
              <div>
                <Button
                  variant="primary"
                  onClick={() => {
                    openForm('open');
                  }}
                >
                  Open Session
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
    );
  }

  // STATE 2 — open.
  if (session.status === 'open') {
    return (
      <Card title="Cash Session — Open">
        <div className="flex flex-col gap-3">
          {error && <Alert variant="danger">{error}</Alert>}
          <div>
            <p className="text-sm text-ink-muted">Opening float</p>
            <MoneyDisplay paisaValue={session.openingCash} />
          </div>
          <p className="text-sm text-ink-faint">Opened at {formatTime(session.openedAt)}</p>

          {mode === 'close' ? (
            <>
              <TextInput
                label="Counted cash (Rs)"
                variant="number"
                autoFocus
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value);
                }}
              />
              <div className="flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setMode('none');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => {
                    void handleClose();
                  }}
                >
                  Close
                </Button>
              </div>
            </>
          ) : (
            <div>
              <Button
                variant="primary"
                onClick={() => {
                  openForm('close');
                }}
              >
                Close Session
              </Button>
            </div>
          )}
        </div>
      </Card>
    );
  }

  // STATE 3 — closed. Session is final for the day — no buttons.
  const difference = session.difference ?? 0;
  const varianceVariant = difference === 0 ? 'success' : difference > 0 ? 'warning' : 'danger';
  const varianceLabel = difference === 0 ? 'Balanced' : difference > 0 ? 'Over by' : 'Short by';

  return (
    <Card title="Cash Session — Closed">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-ink-muted">Float</p>
            <MoneyDisplay paisaValue={session.openingCash} tone="muted" />
          </div>
          <div>
            <p className="text-sm text-ink-muted">Expected</p>
            <MoneyDisplay paisaValue={session.expectedCash ?? 0} tone="muted" />
          </div>
          <div>
            <p className="text-sm text-ink-muted">Counted</p>
            <MoneyDisplay paisaValue={session.countedCash ?? 0} tone="muted" />
          </div>
        </div>
        <Alert variant={varianceVariant}>
          {varianceLabel} <MoneyDisplay paisaValue={Math.abs(difference)} tone="muted" />
        </Alert>
      </div>
    </Card>
  );
}
