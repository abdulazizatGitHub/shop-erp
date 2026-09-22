import { EmptyState } from '@shop/ui';

/** Placeholder — built in P16-3b (docs/phases/PHASE_16.md, ADR-0015). */
export function CommissionApprovalsTab(): React.JSX.Element {
  return (
    <EmptyState
      message="Commission approvals are coming in P16-3b"
      hint="Delivered jobs will create pending commission claims here once P16-3a ships."
    />
  );
}
