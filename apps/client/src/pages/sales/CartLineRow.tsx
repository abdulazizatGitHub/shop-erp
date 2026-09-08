import type { ItemLookups } from '@shop/contracts';
import { MoneyDisplay, QuantityDisplay } from '@shop/ui';
import type { CartLine } from './CartTable.js';
import { lineTotalPaisa } from './CartTable.js';

/** Same Parts/Repair color convention as ItemResultRow.tsx — resolved client-side, no new IPC. */
function resolveTypePill(
  businessUnitId: string | null,
  lookups: ItemLookups | null,
): { letter: string; className: string } | null {
  const unit = lookups?.businessUnits.find((u) => u.id === businessUnitId);
  if (!unit) return null;
  if (unit.code === 'PARTS') return { letter: 'P', className: 'bg-brand-subtle text-brand' };
  if (unit.code === 'REPAIR') return { letter: 'R', className: 'bg-warning-subtle text-warning' };
  return null;
}

function MinusIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export interface CartLineRowProps {
  readonly line: CartLine;
  readonly lookups: ItemLookups | null;
  readonly onRemove: () => void;
  /** Optional: when omitted, no −/+ buttons are rendered. delta is +1 or -1 whole unit. */
  readonly onQuantityChange?: ((delta: number) => void) | undefined;
}

/** One cart row: type pill, name, "qty × price" secondary line with -/+ steppers, total, always-visible trash. */
export function CartLineRow({
  line,
  lookups,
  onRemove,
  onQuantityChange,
}: CartLineRowProps): React.JSX.Element {
  const totalPaisa = lineTotalPaisa(line);
  const pill = resolveTypePill(line.businessUnitId ?? null, lookups);
  const minStepMilli = line.saleToStockFactor ?? 1000;
  const atMinimum = line.quantityMilli <= minStepMilli;

  return (
    <div className="flex items-center gap-2 border-b border-line px-1 py-2 last:border-b-0">
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold ${
          pill ? pill.className : 'bg-surface-input text-ink-faint'
        }`}
      >
        {pill?.letter ?? ''}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-ink" title={line.itemLabel}>
          {line.itemLabel}
        </p>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] text-ink-faint">
          {onQuantityChange && (
            <button
              type="button"
              aria-label={`Decrease quantity of ${line.itemLabel}`}
              disabled={atMinimum}
              onClick={() => {
                onQuantityChange(-1);
              }}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-line text-ink-faint hover:border-danger hover:text-danger disabled:pointer-events-none disabled:opacity-40"
            >
              <MinusIcon />
            </button>
          )}
          <span className="shrink-0 whitespace-nowrap">
            <QuantityDisplay quantityMilli={line.quantityMilli} /> {line.unitLabel}
          </span>
          {onQuantityChange && (
            <button
              type="button"
              aria-label={`Increase quantity of ${line.itemLabel}`}
              onClick={() => {
                onQuantityChange(1);
              }}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-line text-ink-faint hover:border-brand hover:text-brand"
            >
              <PlusIcon />
            </button>
          )}
          {line.unitPricePaisa !== null && (
            <span className="shrink-0 whitespace-nowrap">
              × <MoneyDisplay paisaValue={line.unitPricePaisa} size="sm" />
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right text-[14px] font-bold text-ink">
        {totalPaisa !== null ? <MoneyDisplay paisaValue={totalPaisa} /> : '—'}
      </div>
      <button
        type="button"
        aria-label={`Remove ${line.itemLabel}`}
        onClick={onRemove}
        className="shrink-0 text-ink-faint hover:text-danger"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" />
        </svg>
      </button>
    </div>
  );
}
