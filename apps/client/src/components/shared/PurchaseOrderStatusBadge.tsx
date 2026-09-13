import { Badge } from '@shop/ui';
import type { BadgeTone } from '@shop/ui';

const TONE_BY_STATUS: Record<string, BadgeTone> = {
  draft: 'neutral',
  sent: 'brand',
  partially_received: 'warning',
  fully_received: 'success',
  cancelled: 'danger',
};

const LABEL_BY_STATUS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_received: 'Partially Received',
  fully_received: 'Fully Received',
  cancelled: 'Cancelled',
};

export interface PurchaseOrderStatusBadgeProps {
  /**
   * electron-api.d.ts's PurchaseOrderRecord/Summary type this as plain
   * `string`, not the narrower PurchaseOrderStatus union (matches every
   * other mirror interface there, e.g. GrnRecord.paymentMode) — the value
   * crosses the IPC boundary as JSON, so TS can't narrow it here. Falls
   * back to a neutral badge with the raw string for any unrecognised value.
   */
  readonly status: string;
}

/**
 * Carries domain knowledge (purchase-order status values), so it lives
 * here rather than packages/ui — same reasoning as BusinessUnitPill.tsx
 * (packages/ui may not import @shop/contracts, eslint.config.js:78-87).
 */
export function PurchaseOrderStatusBadge({
  status,
}: PurchaseOrderStatusBadgeProps): React.JSX.Element {
  return (
    <Badge tone={TONE_BY_STATUS[status] ?? 'neutral'}>{LABEL_BY_STATUS[status] ?? status}</Badge>
  );
}
