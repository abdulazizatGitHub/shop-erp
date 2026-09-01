import { Money } from '@shop/shared';

export type MoneyDisplaySize = 'sm' | 'base' | 'lg' | 'xl' | 'total';

export interface MoneyDisplayProps {
  /** Raw integer paisa — never a rupee float. See ADR-0003. */
  readonly paisaValue: number;
  readonly size?: MoneyDisplaySize;
  /** Overrides the automatic negative-is-red rule for a specific money direction. */
  readonly tone?: 'in' | 'out' | 'due' | 'muted' | 'auto';
}

const SIZE_CLASSES: Record<MoneyDisplaySize, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  total: 'text-total font-semibold',
};

/**
 * The only place a money figure is rendered as text in this app (mirrors
 * CODING_STANDARDS.md §3 — "MoneyDisplay is the only place money is
 * formatted"). Always monospace/tabular so amounts line up in a column.
 */
export function MoneyDisplay({
  paisaValue,
  size = 'base',
  tone = 'auto',
}: MoneyDisplayProps): React.JSX.Element {
  const paisa = Money.of(paisaValue);
  const text = Money.format(paisa);
  const colorClass =
    tone === 'in'
      ? 'text-money-in'
      : tone === 'out'
        ? 'text-money-out'
        : tone === 'due'
          ? 'text-money-due'
          : tone === 'muted'
            ? 'text-ink-faint'
            : paisa < 0
              ? 'text-danger'
              : 'text-ink';
  return (
    <span className={`font-mono tabular-nums ${SIZE_CLASSES[size]} ${colorClass}`}>{text}</span>
  );
}
