import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

export type TextInputVariant = 'text' | 'search' | 'number';
export type TextInputSize = 'default' | 'large';

export interface TextInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'type' | 'size'
> {
  readonly variant?: TextInputVariant;
  readonly label?: string;
  readonly size?: TextInputSize;
  /** Right-align — e.g. a money/quantity entry field. Defaults to left. */
  readonly align?: 'left' | 'right';
}

const VARIANT_INPUT_MODE: Partial<Record<TextInputVariant, TextInputProps['inputMode']>> = {
  number: 'decimal',
};

const SIZE_CLASSES: Record<TextInputSize, string> = {
  default: 'text-base px-3 py-2',
  large: 'text-xl px-4 py-3',
};

/**
 * Every text/search/number input in the app. Forwards its ref — several
 * screens focus these programmatically (F10 checkout flow, Enter-to-next-field).
 */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { variant = 'text', label, size = 'default', align = 'left', inputMode, ...rest },
  ref,
) {
  const input = (
    <input
      ref={ref}
      // Always type="text", even for variant="number": money/quantity are
      // parsed by Money.fromRupees/Qty.fromUnits from a string, and native
      // type="number" inputs have known locale/decimal-separator quirks.
      type="text"
      inputMode={inputMode ?? VARIANT_INPUT_MODE[variant]}
      // Monospace only for "number" (money/quantity entry) — a "text"/"search"
      // input (item/customer/supplier name search) must stay font-sans.
      className={`w-full rounded-md border border-line bg-surface text-ink placeholder:text-ink-faint focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus disabled:bg-surface-sunken disabled:text-ink-faint ${variant === 'number' ? 'font-mono' : 'font-sans'} ${SIZE_CLASSES[size]} ${align === 'right' ? 'text-right' : 'text-left'}`}
      {...rest}
    />
  );
  if (!label) return input;
  return (
    <label className="flex flex-col gap-1 text-sm text-ink-muted">
      {label}
      {input}
    </label>
  );
});
