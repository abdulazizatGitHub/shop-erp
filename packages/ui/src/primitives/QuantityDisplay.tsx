import { Qty } from '@shop/shared';

export interface QuantityDisplayProps {
  /** Raw integer milli-units — never a float unit count. See ADR-0003. */
  readonly quantityMilli: number;
  readonly unitLabel?: string;
}

/** Tabular figures, same reasoning as MoneyDisplay — quantities sit next to money in tables. */
export function QuantityDisplay({
  quantityMilli,
  unitLabel,
}: QuantityDisplayProps): React.JSX.Element {
  const text = Qty.format(Qty.of(quantityMilli), unitLabel ? { unit: unitLabel } : {});
  return <span className="font-mono tabular-nums text-ink">{text}</span>;
}
