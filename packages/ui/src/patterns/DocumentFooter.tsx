import type { ReactNode } from 'react';
import type { DocumentLayout } from './DocumentHeader.js';
import { useShopIdentity } from './ShopIdentityContext.js';

const LAYOUT: Record<DocumentLayout, string> = {
  stacked: 'flex flex-col gap-1',
  row: 'flex flex-row items-center gap-6',
  'row-reverse': 'flex flex-row-reverse items-center gap-6',
};

export interface DocumentFooterProps {
  readonly className?: string;
  readonly layout?: DocumentLayout;
  /** Overrides shop.invoiceFooterText when provided. */
  readonly text?: string;
  readonly showGeneratedDate?: boolean;
  readonly children?: ReactNode;
}

function todayDisplay(): string {
  return new Date().toLocaleDateString();
}

/** CL-0b. Shared footer for every printed-document preview. */
export function DocumentFooter({
  className,
  layout = 'stacked',
  text,
  showGeneratedDate = false,
  children,
}: DocumentFooterProps): React.JSX.Element {
  const shop = useShopIdentity();
  const footerText = text ?? shop?.invoiceFooterText ?? null;

  return (
    <div className={[LAYOUT[layout], className].filter(Boolean).join(' ')}>
      {footerText !== null && <p className="text-sm text-ink-muted">{footerText}</p>}
      {children}
      {showGeneratedDate && <p className="text-xs text-ink-faint">Generated {todayDisplay()}</p>}
    </div>
  );
}
