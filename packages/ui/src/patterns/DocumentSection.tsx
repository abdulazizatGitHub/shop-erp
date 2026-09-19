import type { ReactNode } from 'react';

export type DocumentSectionLayout = 'stacked' | 'row' | 'grid-2';

const SECTION_LAYOUT: Record<DocumentSectionLayout, string> = {
  stacked: 'flex flex-col gap-1',
  row: 'flex flex-row gap-6',
  'grid-2': 'grid grid-cols-2 gap-4',
};

export interface DocumentSectionProps {
  readonly title?: string;
  readonly className?: string;
  readonly layout?: DocumentSectionLayout;
  readonly children: ReactNode;
}

/** CL-0b. A titled block inside a printed-document preview — customer info, totals, etc. */
export function DocumentSection({
  title,
  className,
  layout = 'stacked',
  children,
}: DocumentSectionProps): React.JSX.Element {
  return (
    <div className={className}>
      {title !== undefined && (
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          {title}
        </h3>
      )}
      <div className={SECTION_LAYOUT[layout]}>{children}</div>
    </div>
  );
}
