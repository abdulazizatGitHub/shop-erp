import type { ItemLookups } from '@shop/contracts';

export interface ResolvedBusinessUnitPill {
  readonly letter: string;
  readonly className: string;
}

/**
 * Shared PARTS/REPAIR resolution — extracted from the identical
 * resolveUnitPill() (ItemProductCard.tsx) and resolveTypePill()
 * (CartLineRow.tsx). Exported separately from the <BusinessUnitPill>
 * component below because callers render the result inside different
 * wrapper shapes (CartLineRow always reserves a fixed-size box, even
 * on no-match; ItemProductCard/ItemsPage render nothing on no-match).
 */
export function resolveBusinessUnitPill(
  businessUnitId: string | null,
  lookups: ItemLookups | null,
): ResolvedBusinessUnitPill | null {
  const unit = lookups?.businessUnits.find((u) => u.id === businessUnitId);
  if (!unit) return null;
  if (unit.code === 'PARTS') return { letter: 'P', className: 'bg-brand-subtle text-brand' };
  if (unit.code === 'REPAIR') return { letter: 'R', className: 'bg-warning-subtle text-warning' };
  return null;
}

export interface BusinessUnitPillProps {
  readonly businessUnitId: string | null;
  readonly lookups: ItemLookups | null;
}

/**
 * PARTS/REPAIR pill badge. Renders nothing when the business unit can't be
 * resolved. Carries domain knowledge (business-unit codes), so it lives
 * here rather than in packages/ui (ARCHITECTURE.md's dependency rules —
 * packages/ui is presentational-only, no domain knowledge).
 */
export function BusinessUnitPill({
  businessUnitId,
  lookups,
}: BusinessUnitPillProps): React.JSX.Element | null {
  const pill = resolveBusinessUnitPill(businessUnitId, lookups);
  if (!pill) return null;

  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase ${pill.className}`}
    >
      {pill.letter}
    </span>
  );
}
