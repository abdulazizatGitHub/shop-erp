import { useEffect, useState } from 'react';
import type { ClaimSummaryDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import {
  Alert,
  Badge,
  EmptyState,
  LoadingState,
  MoneyDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@shop/ui';
import { ipc } from '../../../lib/ipc.js';
import { useCommissionRefresh } from '../CommissionRefreshContext.js';
import { commissionBasisText } from './commissionBasisText.js';
import { ClaimDetailModal } from './ClaimDetailModal.js';

const STATUS_TONE = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
} as const;

/** P16-3b — replaces the placeholder. Pending AND decided claims are both listed (a decided one shows a Reverse action, via the detail modal). */
export function CommissionApprovalsTab(): React.JSX.Element {
  const [claims, setClaims] = useState<readonly ClaimSummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const { bump: bumpCommissionRefresh } = useCommissionRefresh();

  function load(): void {
    ipc.commission
      .listAll()
      .then(setClaims)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load commission claims');
      });
  }

  useEffect(() => {
    load();
  }, []);

  const pendingClaims = (claims ?? []).filter((c) => c.status === 'pending');
  const pendingTotalPaisa = pendingClaims.reduce((sum, c) => sum + c.suggestedAmountPaisa, 0);

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="danger">{error}</Alert>}

      {claims !== null && (
        <div className="rounded-md border border-line bg-surface-sunken p-3 text-sm">
          <span className="font-medium text-ink">Pending: {pendingClaims.length}</span>
          <span className="text-ink-muted">
            {' '}
            — {Money.format(Money.of(pendingTotalPaisa))} suggested, not yet approved to anyone
          </span>
        </div>
      )}

      {claims === null && <LoadingState message="Loading commission claims…" />}

      {claims !== null && claims.length === 0 && (
        <EmptyState
          message="No commission claims yet"
          hint="Delivering a job with a commission-configured labour charge creates one here automatically."
        />
      )}

      {claims !== null && claims.length > 0 && (
        <Table>
          <TableHead>
            <TableRow hover="neutral">
              <TableHeaderCell>Job</TableHeaderCell>
              <TableHeaderCell>Customer</TableHeaderCell>
              <TableHeaderCell>Charge</TableHeaderCell>
              <TableHeaderCell className="text-right">Labour amount</TableHeaderCell>
              <TableHeaderCell>Suggested</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {claims.map((claim) => (
              <TableRow
                key={claim.claimId}
                hover="neutral"
                onClick={() => {
                  setSelectedClaimId(claim.claimId);
                }}
              >
                <TableCell>{claim.jobDocNo}</TableCell>
                <TableCell>{claim.customerName}</TableCell>
                <TableCell>{claim.serviceChargeName}</TableCell>
                <TableCell className="text-right">
                  <MoneyDisplay paisaValue={claim.labourAmountPaisa} />
                </TableCell>
                <TableCell>
                  {Money.format(Money.of(claim.suggestedAmountPaisa))} (
                  {commissionBasisText(
                    claim.commissionMode,
                    claim.commissionAmountPaisa,
                    claim.commissionBp,
                    claim.labourAmountPaisa,
                  )}
                  )
                </TableCell>
                <TableCell>
                  <Badge tone={STATUS_TONE[claim.status]}>
                    {claim.status === 'approved' && claim.latestDecisionTotalPaisa !== null
                      ? `Approved: ${Money.format(Money.of(claim.latestDecisionTotalPaisa))}`
                      : claim.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {selectedClaimId && (
        <ClaimDetailModal
          claimId={selectedClaimId}
          onClose={() => {
            setSelectedClaimId(null);
          }}
          onChanged={() => {
            setSelectedClaimId(null);
            load();
            bumpCommissionRefresh();
          }}
        />
      )}
    </div>
  );
}
