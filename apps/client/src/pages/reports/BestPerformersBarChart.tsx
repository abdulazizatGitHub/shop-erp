import type { StockPerformanceRowDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { colors } from '@shop/ui';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface BestPerformersBarChartProps {
  readonly rows: readonly StockPerformanceRowDto[];
}

interface BarRow {
  readonly itemName: string;
  readonly revenueRupees: number;
  readonly revenuePaisa: number;
}

// recharts v3's Tooltip formatter type is a strict intersection that a
// narrowly-typed function doesn't structurally satisfy — accept unknown and
// narrow internally instead, matching ExpensesReport.tsx's existing pattern.
function formatRevenueTooltip(_value: unknown, _name: unknown, item: unknown): string {
  const payload = (item as { payload?: BarRow }).payload;
  return Money.format(Money.of(payload?.revenuePaisa ?? 0));
}

/**
 * P12-1 — horizontal bar (layout="vertical") ranks the top 10 items by
 * revenue, independent of stock quantity: `StockPerformanceRowDto.quantityMilli`
 * (a separate field, the "Stock" table column) never feeds this chart's axis,
 * so a negative or zero current-stock figure elsewhere in the data can't
 * distort or crash this ranking.
 */
export function BestPerformersBarChart({ rows }: BestPerformersBarChartProps): React.JSX.Element {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-ink-faint">No data for this period.</p>;
  }

  const top10: BarRow[] = [...rows]
    .sort((a, b) => b.revenuePaisa - a.revenuePaisa)
    .slice(0, 10)
    .map((row) => ({
      itemName: row.itemName,
      // divide paisa by 100 for chart display only
      revenueRupees: row.revenuePaisa / 100,
      revenuePaisa: row.revenuePaisa,
    }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={top10} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid stroke={colors.line.default} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 12, fill: colors.ink.muted }} />
        <YAxis
          type="category"
          dataKey="itemName"
          width={140}
          tick={{ fontSize: 12, fill: colors.ink.muted }}
        />
        <Tooltip formatter={formatRevenueTooltip} />
        <Bar
          dataKey="revenueRupees"
          name="Revenue"
          fill={colors.brand.default}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
