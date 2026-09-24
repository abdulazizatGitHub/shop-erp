import { useEffect, useState } from 'react';
import type { ClaimDetailDto, DecisionRecordDto, StaffDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { Alert, Badge, Button, Modal, Select, TextInput } from '@shop/ui';
import { ipc } from '../../../lib/ipc.js';
import { sanitizeMoneyInput } from '../../jobs/money-input.js';
import { commissionBasisText } from './commissionBasisText.js';

interface RecipientRow {
  readonly key: string;
  technicianPartyId: string;
  amountRupees: string;
  outsideHistoryReason: string;
}

function emptyRow(key: string): RecipientRow {
  return { key, technicianPartyId: '', amountRupees: '', outsideHistoryReason: '' };
}

/** Latest decision, or undefined if never decided. Same array-order convention as getClaimDetail (attemptNo ascending). */
function latestDecision(decisions: readonly DecisionRecordDto[]): DecisionRecordDto | undefined {
  return decisions[decisions.length - 1];
}

function isPending(decisions: readonly DecisionRecordDto[]): boolean {
  const latest = latestDecision(decisions);
  return latest === undefined || latest.reversal !== null;
}

export interface ClaimDetailModalProps {
  readonly claimId: string;
  readonly onClose: () => void;
  /** Called after any successful approve/reject/reverse — the parent refetches its list and closes this modal. */
  readonly onChanged: () => void;
}

/**
 * P16-3b — full detail view (technician history incl. removed, decision/
 * reversal trail) plus the Approve/Reject/Reverse actions themselves, so
 * the owner reviews and decides in one place. Every check (recipient
 * eligibility, non-blank reasons) is re-enforced server-side by
 * commission-decision.repository.ts regardless of what this form does —
 * this is convenience, not the source of truth.
 */
export function ClaimDetailModal({
  claimId,
  onClose,
  onChanged,
}: ClaimDetailModalProps): React.JSX.Element {
  const [detail, setDetail] = useState<ClaimDetailDto | null>(null);
  const [staff, setStaff] = useState<readonly StaffDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'approve' | 'reject' | 'reverse'>('view');
  const [recipients, setRecipients] = useState<readonly RecipientRow[]>([emptyRow('r0')]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDetail(null);
    setError(null);
    setMode('view');
    setReason('');
    ipc.commission
      .getDetail(claimId)
      .then((loaded) => {
        setDetail(loaded);
        const prefillId = loaded.suggestedRecipientPartyId ?? '';
        setRecipients([
          {
            key: 'r0',
            technicianPartyId: prefillId,
            amountRupees: String(Money.toRupees(Money.of(loaded.suggestedAmountPaisa))),
            outsideHistoryReason: '',
          },
        ]);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load claim detail');
      });
    ipc.staff
      .listStaff()
      .then(setStaff)
      .catch(() => {
        setStaff([]); // a staff-list load failure never blocks viewing the claim, only the recipient dropdown
      });
  }, [claimId]);

  if (!detail) {
    return (
      <Modal open title="Commission claim" onClose={onClose}>
        {error ? (
          <Alert variant="danger">{error}</Alert>
        ) : (
          <p className="text-sm text-ink-muted">Loading…</p>
        )}
      </Modal>
    );
  }

  const pending = isPending(detail.decisions);
  const historyPartyIds = new Set(detail.technicianHistory.map((t) => t.technicianPartyId));
  const basis = commissionBasisText(
    detail.commissionMode,
    detail.commissionAmountPaisa,
    detail.commissionBp,
    detail.labourAmountPaisa,
  );

  function updateRecipient(key: string, patch: Partial<RecipientRow>): void {
    setRecipients((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRecipient(): void {
    setRecipients((prev) => [...prev, emptyRow(`r${String(prev.length)}`)]);
  }

  function removeRecipient(key: string): void {
    setRecipients((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  async function handleApprove(): Promise<void> {
    setError(null);
    const parsedRecipients: {
      technicianPartyId: string;
      amountPaisa: number;
      outsideHistoryReason: string | null;
    }[] = [];

    for (const row of recipients) {
      if (row.technicianPartyId.trim().length === 0) {
        setError('Every recipient row needs a staff member selected');
        return;
      }
      let amountPaisa: number;
      try {
        amountPaisa = Money.fromRupees(row.amountRupees);
      } catch {
        setError('Every recipient amount must be a valid Rs amount');
        return;
      }
      if (amountPaisa <= 0) {
        setError('Every recipient amount must be greater than zero');
        return;
      }
      const outsideHistory = !historyPartyIds.has(row.technicianPartyId);
      if (outsideHistory && row.outsideHistoryReason.trim().length === 0) {
        setError(
          "A recipient not on this job's technician list needs a reason (shown below their row)",
        );
        return;
      }
      parsedRecipients.push({
        technicianPartyId: row.technicianPartyId,
        amountPaisa,
        outsideHistoryReason: outsideHistory ? row.outsideHistoryReason.trim() : null,
      });
    }

    setSubmitting(true);
    try {
      await ipc.commission.approve({
        claimId,
        recipients: parsedRecipients,
        decidedAt: new Date().toISOString().slice(0, 10),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve claim');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject(): Promise<void> {
    setError(null);
    if (reason.trim().length === 0) {
      setError('A reason is required to reject a claim');
      return;
    }
    setSubmitting(true);
    try {
      await ipc.commission.reject({
        claimId,
        reason: reason.trim(),
        decidedAt: new Date().toISOString().slice(0, 10),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject claim');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReverse(): Promise<void> {
    setError(null);
    if (reason.trim().length === 0) {
      setError('A reason is required to reverse a decision');
      return;
    }
    if (!detail) return;
    const decision = latestDecision(detail.decisions);
    if (!decision) return;
    setSubmitting(true);
    try {
      await ipc.commission.reverse({
        decisionId: decision.id,
        reason: reason.trim(),
        reversedAt: new Date().toISOString().slice(0, 10),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reverse decision');
    } finally {
      setSubmitting(false);
    }
  }

  const totalApprovePaisa = recipients.reduce((sum, r) => {
    try {
      return sum + Money.fromRupees(r.amountRupees || '0');
    } catch {
      return sum;
    }
  }, 0);
  const diffPaisa = totalApprovePaisa - detail.suggestedAmountPaisa;

  return (
    <Modal open title={`Commission claim — ${detail.jobDocNo}`} onClose={onClose} size="wide">
      <div className="flex flex-col gap-5">
        {error && <Alert variant="danger">{error}</Alert>}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-ink-muted">Customer</p>
            <p className="font-medium text-ink">{detail.customerName}</p>
          </div>
          <div>
            <p className="text-ink-muted">Service charge</p>
            <p className="font-medium text-ink">{detail.serviceChargeName}</p>
          </div>
          <div>
            <p className="text-ink-muted">Labour amount</p>
            <p className="font-medium text-ink">
              {Money.format(Money.of(detail.labourAmountPaisa))}
            </p>
          </div>
          <div>
            <p className="text-ink-muted">Suggested amount</p>
            <p className="font-medium text-ink">
              {Money.format(Money.of(detail.suggestedAmountPaisa))} ({basis})
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Technician history</p>
          <ul className="flex flex-col gap-1 text-sm">
            {detail.technicianHistory.map((t) => (
              <li key={t.technicianPartyId} className="flex items-center gap-2">
                <span>{t.technicianName}</span>
                <span className="text-ink-muted">
                  assigned {t.assignedAt.slice(0, 10)}
                  {t.unassignedAt ? `, removed ${t.unassignedAt.slice(0, 10)}` : ' (active)'}
                </span>
              </li>
            ))}
            {detail.technicianHistory.length === 0 && (
              <li className="text-ink-muted">No technician was ever assigned to this job.</li>
            )}
          </ul>
        </div>

        {detail.decisions.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Decision / reversal trail</p>
            <ul className="flex flex-col gap-2 text-sm">
              {detail.decisions.map((d) => (
                <li key={d.id} className="rounded-md border border-line p-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={d.decision === 'approved' ? 'success' : 'danger'}>
                      Attempt {d.attemptNo}: {d.decision}
                    </Badge>
                    <span className="text-ink-muted">{d.decidedAt}</span>
                    {d.reversal && <Badge tone="warning">Reversed {d.reversal.reversedAt}</Badge>}
                  </div>
                  {d.reason && <p className="mt-1 text-ink-muted">Reason: {d.reason}</p>}
                  {d.recipients.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {d.recipients.map((r) => (
                        <li key={r.technicianPartyId}>
                          {r.technicianName}: {Money.format(Money.of(r.amountPaisa))}
                          {r.outsideHistoryReason && (
                            <span className="text-warning">
                              {' '}
                              — outside history: {r.outsideHistoryReason}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {d.reversal && (
                    <p className="mt-1 text-ink-muted">Reversal reason: {d.reversal.reason}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {mode === 'view' && (
          <div className="flex justify-end gap-3">
            {pending && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setMode('reject');
                  }}
                >
                  Reject
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setMode('approve');
                  }}
                >
                  Approve
                </Button>
              </>
            )}
            {!pending && (
              <Button
                variant="secondary"
                onClick={() => {
                  setMode('reverse');
                }}
              >
                Reverse
              </Button>
            )}
          </div>
        )}

        {mode === 'approve' && (
          <div className="flex flex-col gap-3 rounded-md border border-line p-4">
            <p className="text-sm font-semibold text-ink">Approve — recipients</p>
            {recipients.map((row) => {
              const outsideHistory =
                row.technicianPartyId.length > 0 && !historyPartyIds.has(row.technicianPartyId);
              return (
                <div key={row.key} className="flex flex-col gap-2 rounded-md bg-surface-sunken p-3">
                  <div className="grid grid-cols-[1fr,140px,auto] items-end gap-2">
                    <Select
                      label="Staff member"
                      value={row.technicianPartyId}
                      onChange={(e) => {
                        updateRecipient(row.key, { technicianPartyId: e.target.value });
                      }}
                    >
                      <option value="">Select…</option>
                      {(staff ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                    <TextInput
                      label="Amount (Rs)"
                      variant="number"
                      value={row.amountRupees}
                      onChange={(e) => {
                        updateRecipient(row.key, {
                          amountRupees: sanitizeMoneyInput(e.target.value),
                        });
                      }}
                    />
                    <Button
                      variant="secondary"
                      disabled={recipients.length === 1}
                      onClick={() => {
                        removeRecipient(row.key);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                  {outsideHistory && (
                    <div>
                      <Badge tone="warning">Not on this job&apos;s technician list</Badge>
                      <TextInput
                        label="Reason (required)"
                        value={row.outsideHistoryReason}
                        onChange={(e) => {
                          updateRecipient(row.key, { outsideHistoryReason: e.target.value });
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            <Button variant="secondary" onClick={addRecipient}>
              Add another recipient
            </Button>
            <p className="text-sm text-ink-muted">
              Total: {Money.format(Money.of(totalApprovePaisa))}
              {diffPaisa !== 0 && (
                <span>
                  {' '}
                  ({diffPaisa > 0 ? '+' : ''}
                  {Money.format(Money.of(diffPaisa))} vs. suggested)
                </span>
              )}
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setMode('view');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={submitting}
                onClick={() => {
                  void handleApprove();
                }}
              >
                {submitting ? 'Approving…' : 'Confirm approval'}
              </Button>
            </div>
          </div>
        )}

        {mode === 'reject' && (
          <div className="flex flex-col gap-3 rounded-md border border-line p-4">
            <TextInput
              label="Reject reason (required)"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
            />
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setMode('view');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={submitting}
                onClick={() => {
                  void handleReject();
                }}
              >
                {submitting ? 'Rejecting…' : 'Confirm reject'}
              </Button>
            </div>
          </div>
        )}

        {mode === 'reverse' && (
          <div className="flex flex-col gap-3 rounded-md border border-line p-4">
            <TextInput
              label="Reversal reason (required)"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
              }}
            />
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setMode('view');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={submitting}
                onClick={() => {
                  void handleReverse();
                }}
              >
                {submitting ? 'Reversing…' : 'Confirm reverse'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
