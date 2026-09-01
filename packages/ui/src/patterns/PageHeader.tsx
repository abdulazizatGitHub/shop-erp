import type { ReactNode } from 'react';

export interface PageHeaderProps {
  readonly title: string;
  readonly actions?: ReactNode;
}

/** Title row at the top of every screen, with optional right-aligned actions. */
export function PageHeader({ title, actions }: PageHeaderProps): React.JSX.Element {
  return (
    <div className="mb-6 flex items-center justify-between">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
