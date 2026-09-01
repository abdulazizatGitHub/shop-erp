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

export function TableRow({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return <tr className="even:bg-surface-sunken hover:bg-brand-subtle">{children}</tr>;
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
