import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'warning';
export type ButtonSize = 'default' | 'large';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Fills the width of its container — e.g. the checkout button on the Sales screen. */
  readonly fullWidth?: boolean;
  readonly children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover disabled:bg-line-strong',
  secondary:
    'bg-surface text-ink border border-line hover:bg-surface-sunken disabled:text-ink-faint',
  danger: 'bg-danger text-white hover:bg-danger disabled:bg-line-strong',
  warning: 'bg-warning text-white hover:bg-warning disabled:bg-line-strong',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  default: 'text-sm px-4 py-2',
  large: 'text-lg px-6 py-3',
};

/** Every button in the app. Sizes/variants are fixed — no ad-hoc button styling per screen. */
export function Button({
  variant = 'secondary',
  size = 'default',
  fullWidth = false,
  type = 'button',
  children,
  ...rest
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-sans font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${fullWidth ? 'w-full' : ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}
