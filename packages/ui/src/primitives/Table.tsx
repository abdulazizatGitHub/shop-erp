import type { ReactNode, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';

export interface TableProps extends Omit<TableHTMLAttributes<HTMLTableElement>, 'className'> {
  readonly children: ReactNode;
}

/** Wraps every data table in the app: header style, zebra rows, cell padding. */
export function Table({ children, ...rest }: TableProps): React.JSX.Element {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-left text-sm" {...rest}>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return <thead className="bg-surface-sunken text-xs uppercase text-ink-muted">{children}</thead>;
}

export function TableBody({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export interface TableRowProps {
  readonly children: ReactNode;
  /** Even-row shading. Defaults to true — every existing caller keeps its current look. */
  readonly zebra?: boolean;
  /** Row hover tint. 'accent' (default) matches every existing caller; 'neutral' is for
   *  screens that don't want a brand-colored hover (e.g. a plain management table). */
  readonly hover?: 'accent' | 'neutral';
}

export function TableRow({
  children,
  zebra = true,
  hover = 'accent',
}: TableRowProps): React.JSX.Element {
  const zebraClass = zebra ? 'even:bg-surface-sunken' : '';
  const hoverClass = hover === 'accent' ? 'hover:bg-brand-subtle' : 'hover:bg-surface-page';
  return <tr className={`${zebraClass} ${hoverClass}`}>{children}</tr>;
}

export function TableHeaderCell({
  children,
  className,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { readonly children?: ReactNode }): React.JSX.Element {
  return (
    <th className={`px-3 py-2 font-medium ${className ?? ''}`} {...rest}>
      {children}
    </th>
  );
}

export function TableCell({
  children,
  className,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { readonly children: ReactNode }): React.JSX.Element {
  return (
    <td className={`px-3 py-2 text-ink ${className ?? ''}`} {...rest}>
      {children}
    </td>
  );
}
