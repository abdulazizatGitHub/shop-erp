import type { ReactNode } from 'react';
import { useShopIdentity } from './ShopIdentityContext.js';

export type DocumentLayout = 'stacked' | 'row' | 'row-reverse';

const LAYOUT: Record<DocumentLayout, string> = {
  stacked: 'flex flex-col gap-1',
  row: 'flex flex-row items-start gap-6',
  'row-reverse': 'flex flex-row-reverse items-start gap-6',
};

export interface DocumentHeaderProps {
  readonly className?: string;
  readonly layout?: DocumentLayout;
  readonly children?: ReactNode;
  readonly slots?: {
    readonly logo?: ReactNode;
    readonly extra?: ReactNode;
  };
}

/**
 * CL-0b. Shared shop-identity header for every printed-document preview
 * (SaleInvoiceModal, PaymentReceiptModal, CustomerStatementModal). Reads
 * from useShopIdentity() — no business logic, no IPC call of its own.
 */
export function DocumentHeader({
  className,
  layout = 'stacked',
  children,
  slots,
}: DocumentHeaderProps): React.JSX.Element {
  const shop = useShopIdentity();

  return (
    <div className={[LAYOUT[layout], className].filter(Boolean).join(' ')}>
      {slots?.logo}
      <div className="flex flex-col gap-1">
        {shop === null ? (
          <div className="h-5 w-40 animate-pulse rounded bg-surface-sunken" />
        ) : (
          <>
            <p className="text-lg font-semibold text-ink">{shop.shopName}</p>
            {shop.shopPhone !== null && <p className="text-sm text-ink-muted">{shop.shopPhone}</p>}
            {shop.shopAddress !== null && (
              <p className="text-sm text-ink-muted">{shop.shopAddress}</p>
            )}
            {shop.shopEmail !== null && <p className="text-sm text-ink-muted">{shop.shopEmail}</p>}
            {shop.invoiceHeaderText !== null && (
              <p className="text-sm text-ink-muted">{shop.invoiceHeaderText}</p>
            )}
          </>
        )}
      </div>
      {slots?.extra}
      {children}
    </div>
  );
}
