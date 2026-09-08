import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'warning' | 'posAccent';
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
  /**
   * Sale-screen-only (A-1 redesign) — pos-accent blue with the spec's lift-
   * on-hover shadow. See colors.ts for why pos-accent is a separate token
   * from `brand`.
   */
  posAccent:
    'bg-pos-accent text-white shadow-[0_2px_8px_rgba(37,99,235,.30),0_1px_2px_rgba(37,99,235,.20)] transition-all hover:-translate-y-px hover:bg-pos-accent-hover hover:shadow-[0_4px_14px_rgba(37,99,235,.38),0_2px_4px_rgba(37,99,235,.28)] disabled:translate-y-0 disabled:bg-line disabled:text-ink-faint disabled:shadow-none',
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
