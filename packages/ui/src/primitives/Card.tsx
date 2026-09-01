import type { ReactNode } from 'react';

export interface CardProps {
  readonly title?: string;
  readonly children: ReactNode;
}

/** Panel for report sections, settings groups, and form panels. */
export function Card({ title, children }: CardProps): React.JSX.Element {
  return (
    <section className="rounded-lg border border-line bg-surface p-4 shadow-sm">
      {title && <h2 className="mb-3 text-lg font-semibold text-ink">{title}</h2>}
      {children}
    </section>
  );
}
