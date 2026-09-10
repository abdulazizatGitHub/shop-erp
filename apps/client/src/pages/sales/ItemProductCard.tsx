import type { ItemDto, ItemLookups } from '@shop/contracts';
import { MoneyDisplay } from '@shop/ui';
import {
  BusinessUnitPill,
  resolveBusinessUnitPill,
} from '../../components/shared/BusinessUnitPill.js';
import { resolveStockBadge } from '../../components/shared/StockBadge.js';

function PackageIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="text-ink-faint"
    >
      <path d="M21 8 12 3 3 8l9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  );
}

function WrenchIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="text-ink-faint"
    >
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2 2.8-2.8Z" />
    </svg>
  );
}

export interface ItemProductCardProps {
  readonly item: ItemDto;
  readonly lookups: ItemLookups | null;
  /** SearchSelect's renderItem(item, highlighted) — true while this card is keyboard-highlighted or has its inline qty row held/active. */
  readonly selected: boolean;
}

/** E-4: POS-style product card — placeholder icon, name, code, stock badge, price, type pill. Presentational only; selection/hold logic stays in SearchSelect/ItemSearchPanel. */
export function ItemProductCard({
  item,
  lookups,
  selected,
}: ItemProductCardProps): React.JSX.Element {
  const pill = resolveBusinessUnitPill(item.businessUnitId, lookups);
  const badge = resolveStockBadge(item.stockOnHandMilli, item.trackStock);
  const isRepair = pill?.letter === 'R';

  return (
    <div
      className={`flex h-full flex-col gap-1.5 rounded-xl border bg-surface px-[7px] py-[9px] transition-colors hover:border-pos-accent-border hover:bg-pos-accent-subtle ${
        selected ? 'border-[1.5px] border-pos-accent bg-pos-accent-subtle' : 'border-line'
      }`}
      title={item.nameEn}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-lg bg-surface-input">
        {isRepair ? <WrenchIcon /> : <PackageIcon />}
      </div>
      <p className="line-clamp-2 text-xs font-semibold leading-tight text-ink">{item.nameEn}</p>
      <p className="truncate font-mono text-caption text-ink-faint">{item.itemCode}</p>
      {badge && <p className={`text-subheadline font-medium ${badge.className}`}>{badge.label}</p>}
      <div className="mt-auto flex items-end justify-between gap-1">
        {item.retailPricePaisa !== null ? (
          <MoneyDisplay paisaValue={item.retailPricePaisa} size="sm" />
        ) : (
          <span className="text-xs text-ink-faint">—</span>
        )}
        <BusinessUnitPill businessUnitId={item.businessUnitId} lookups={lookups} />
      </div>
    </div>
  );
}
