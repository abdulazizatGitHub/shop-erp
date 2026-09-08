import type { ItemDto, ItemLookups } from '@shop/contracts';
import { MoneyDisplay } from '@shop/ui';

/** Resolves the item's business unit to a Parts/Repair pill — client-side only, no new IPC. */
function resolveUnitPill(
  item: ItemDto,
  lookups: ItemLookups | null,
): { label: string; className: string } | null {
  const unit = lookups?.businessUnits.find((u) => u.id === item.businessUnitId);
  if (!unit) return null;
  if (unit.code === 'PARTS') {
    return { label: 'Parts', className: 'bg-brand-subtle text-brand' };
  }
  if (unit.code === 'REPAIR') {
    return { label: 'Repair', className: 'bg-warning-subtle text-warning' };
  }
  return { label: unit.name, className: 'bg-surface-input text-ink-muted' };
}

export interface ItemResultRowProps {
  readonly item: ItemDto;
  readonly lookups: ItemLookups | null;
  readonly uomName: (id: string) => string;
}

/** Presentational item row for the sale screen's item search results. No state, no keyboard handling. */
export function ItemResultRow({ item, lookups, uomName }: ItemResultRowProps): React.JSX.Element {
  const pill = resolveUnitPill(item, lookups);

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-input text-sm font-semibold text-ink-muted">
          {item.nameEn.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-ink">{item.nameEn}</p>
          <span className="mt-0.5 inline-block rounded bg-surface-input px-1.5 py-0.5 text-xs text-ink-faint">
            {item.itemCode}
          </span>
          {/* TODO(P-UI-4): stock-on-hand badge — no data source yet.
              ItemDto/item:search carry no stock quantity field. Left
              empty rather than fabricated; see PROJECT.md known gaps. */}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-right">
        {pill && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${pill.className}`}
          >
            {pill.label}
          </span>
        )}
        <div>
          {item.retailPricePaisa !== null ? (
            <MoneyDisplay paisaValue={item.retailPricePaisa} size="sm" />
          ) : (
            <span className="text-xs text-ink-faint">—</span>
          )}
          <p className="text-xs text-ink-faint">{uomName(item.stockUomId)}</p>
        </div>
      </div>
    </div>
  );
}
