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

export interface CartLineRowProps {
  readonly line: CartLine;
  readonly lookups: ItemLookups | null;
  readonly onRemove: () => void;
}

/** One cart row: type pill, name, "qty × price" secondary line, total, hover-only trash. */
export function CartLineRow({ line, lookups, onRemove }: CartLineRowProps): React.JSX.Element {
  const totalPaisa = lineTotalPaisa(line);
  const pill = resolveTypePill(line.businessUnitId ?? null, lookups);

  return (
    <div className="group flex items-center gap-2 border-b border-line px-1 py-2 last:border-b-0">
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold ${
          pill ? pill.className : 'bg-surface-input text-ink-faint'
        }`}
      >
        {pill?.letter ?? ''}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-ink" title={line.itemLabel}>
          {line.itemLabel}
        </p>
        <p className="text-[11px] text-ink-faint">
          <QuantityDisplay quantityMilli={line.quantityMilli} /> {line.unitLabel}
          {line.unitPricePaisa !== null && (
            <>
              {' '}
              × <MoneyDisplay paisaValue={line.unitPricePaisa} size="sm" />
            </>
          )}
        </p>
      </div>
      <div className="shrink-0 text-right text-[14px] font-bold text-ink">
        {totalPaisa !== null ? <MoneyDisplay paisaValue={totalPaisa} /> : '—'}
      </div>
      <button
        type="button"
        aria-label={`Remove ${line.itemLabel}`}
        onClick={onRemove}
        className="shrink-0 text-ink-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
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
