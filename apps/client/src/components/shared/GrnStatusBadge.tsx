import { Badge } from '@shop/ui';
import type { BadgeTone } from '@shop/ui';

const TONE_BY_STATUS: Record<string, BadgeTone> = {
  confirmed: 'success',
  cancelled: 'danger',
};

const LABEL_BY_STATUS: Record<string, string> = {
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
};

export interface GrnStatusBadgeProps {
  /** See PurchaseOrderStatusBadge.tsx's status prop comment — same `string`-not-union reasoning. */
  readonly status: string;
}

/** Same reasoning as PurchaseOrderStatusBadge.tsx — domain knowledge stays out of packages/ui. */
export function GrnStatusBadge({ status }: GrnStatusBadgeProps): React.JSX.Element {
  return (
    <Badge tone={TONE_BY_STATUS[status] ?? 'neutral'}>{LABEL_BY_STATUS[status] ?? status}</Badge>
  );
}
