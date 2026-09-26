import type { ItemDto, ItemLookups } from '@shop/contracts';
import { Button, MoneyDisplay, TableCell, TableRow } from '@shop/ui';
import { BusinessUnitPill } from '../../components/shared/BusinessUnitPill.js';
import { resolveStockBadge } from '../../components/shared/StockBadge.js';

export interface ItemsTableRowProps {
  readonly item: ItemDto;
  readonly lookups: ItemLookups | null;
  readonly uomName: (id: string) => string;
  readonly onHistoryClick: (item: ItemDto) => void;
}

/**
 * Extracted out of ItemsPage.tsx (P17-2, docs/phases/PHASE_17.md §2.2)
 * once that file crossed the 300-line convention.
 *
 * The stock badge reads counterStockMilli (Shop-only — what this
 * counter can actually sell), never the all-warehouse stockOnHandMilli.
 * When the two figures differ (some of this item's stock is out in a
 * technician's custody), show both — the Items list is inventory
 * management, so the owner needs the full picture, not just the
 * counter's sellable amount.
 */
export function ItemsTableRow({
  item,
  lookups,
  uomName,
  onHistoryClick,
}: ItemsTableRowProps): React.JSX.Element {
  const stockBadge = resolveStockBadge(item.counterStockMilli, item.trackStock, item.isLowStock);
  const technicianMilli =
    item.stockOnHandMilli !== null && item.counterStockMilli !== null
      ? item.stockOnHandMilli - item.counterStockMilli
      : 0;

  return (
    <TableRow zebra={false} hover="neutral">
      <TableCell className="py-3">
        <span className="inline-flex items-center rounded border border-line bg-surface-page px-2 py-0.5 font-mono text-xs text-ink-faint">
          {item.itemCode}
        </span>
      </TableCell>
      <TableCell className="py-3">{item.nameEn}</TableCell>
      <TableCell className="py-3">
        <BusinessUnitPill businessUnitId={item.businessUnitId} lookups={lookups} />
      </TableCell>
      <TableCell className="py-3">{uomName(item.stockUomId)}</TableCell>
      <TableCell className="py-3">
        {stockBadge ? (
          <div>
            <span className={`text-sm font-medium ${stockBadge.className}`}>
              {stockBadge.label}
            </span>
            {technicianMilli > 0 && (
              <div className="text-xs text-ink-faint">
                Shop: {Math.floor((item.counterStockMilli ?? 0) / 1000)} · With technicians:{' '}
                {Math.floor(technicianMilli / 1000)}
              </div>
            )}
          </div>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </TableCell>
      <TableCell className="py-3 text-right">
        {item.retailPricePaisa !== null ? <MoneyDisplay paisaValue={item.retailPricePaisa} /> : '—'}
      </TableCell>
      <TableCell className="py-3">{item.altUomId ? uomName(item.altUomId) : '—'}</TableCell>
      <TableCell className="py-3">
        <Button
          variant="secondary"
          onClick={() => {
            onHistoryClick(item);
          }}
        >
          History
        </Button>
      </TableCell>
    </TableRow>
  );
}
