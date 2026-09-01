import { forwardRef } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  readonly label?: string;
  readonly children: ReactNode;
}

/** Every dropdown in the app (business unit, UoM, etc.) — plain <option> children, styled to match TextInput. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, children, ...rest },
  ref,
) {
  const select = (
    <select
      ref={ref}
      className="w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus disabled:bg-surface-sunken disabled:text-ink-faint"
      {...rest}
    >
      {children}
    </select>
  );
  if (!label) return select;
  return (
    <label className="flex flex-col gap-1 text-sm text-ink-muted">
      {label}
      {select}
    </label>
  );
});
