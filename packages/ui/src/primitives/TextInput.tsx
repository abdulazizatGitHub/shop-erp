import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

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
  /**
   * 'accent' swaps the focus border/ring to pos-accent and applies the
   * Sale-screen's Apple-style height/radius (A-1 redesign) — opt-in, so
   * every other input in the app keeps its default look unchanged.
   */
  readonly tone?: 'default' | 'accent';
  /**
   * Leading icon (e.g. a search glyph) rendered inside the input's left
   * edge — opt-in, so every other caller's layout is unchanged. When set,
   * the input gets left padding to clear it instead of the usual px-3.
   */
  readonly icon?: ReactNode;
}

const VARIANT_INPUT_MODE: Partial<Record<TextInputVariant, TextInputProps['inputMode']>> = {
  number: 'decimal',
};

// Split into left/right so an icon can override just pl-* without fighting
// a combined px-* utility of equal Tailwind specificity for the win.
const SIZE_CLASSES: Record<TextInputSize, { text: string; py: string; pl: string; pr: string }> = {
  default: { text: 'text-base', py: 'py-2', pl: 'pl-3', pr: 'pr-3' },
  large: { text: 'text-xl', py: 'py-3', pl: 'pl-4', pr: 'pr-4' },
};

/**
 * Every text/search/number input in the app. Forwards its ref — several
 * screens focus these programmatically (F10 checkout flow, Enter-to-next-field).
 */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    variant = 'text',
    label,
    size = 'default',
    align = 'left',
    tone = 'default',
    icon,
    inputMode,
    ...rest
  },
  ref,
) {
  const toneClasses =
    tone === 'accent'
      ? 'h-11 rounded-xl border-[1.5px] border-line focus:border-pos-accent focus:outline-none focus:ring-[3px] focus:ring-pos-accent/10'
      : 'rounded-md border border-line focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus';
  const sizeCfg = SIZE_CLASSES[size];
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
      className={`w-full bg-surface text-ink placeholder:text-ink-faint disabled:bg-surface-sunken disabled:text-ink-faint ${toneClasses} ${variant === 'number' ? 'font-mono' : 'font-sans'} ${sizeCfg.text} ${sizeCfg.py} ${sizeCfg.pr} ${icon ? 'pl-9' : sizeCfg.pl} ${align === 'right' ? 'text-right' : 'text-left'}`}
      {...rest}
    />
  );
  const inputWithIcon = icon ? (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
        {icon}
      </span>
      {input}
    </div>
  ) : (
    input
  );
  if (!label) return inputWithIcon;
  return (
    <label className="flex flex-col gap-1 text-sm text-ink-muted">
      {label}
      {inputWithIcon}
    </label>
  );
});
