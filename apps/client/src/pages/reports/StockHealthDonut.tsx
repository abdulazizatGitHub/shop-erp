import type { StockValuationLineDto } from '@shop/contracts';
import { colors } from '@shop/ui';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer } from 'recharts';

export interface StockHealthDonutProps {
  readonly lines: readonly StockValuationLineDto[];
}

interface Slice {
  readonly name: string;
  readonly count: number;
  readonly fill: string;
}

/**
 * P12-1 — bucketed by count of items, never by the raw quantity value, so a
 * negative or zero quantityOnHandMilli (seen in real dev data) never feeds a
 * chart value directly: it's just counted into the "Out of Stock" bucket
 * alongside true zero-stock items. Every line always lands in exactly one
 * bucket (>0 vs <=0), so the two slices always sum to lines.length. Exported
 * as a pure function so the bucketing itself can be unit-tested without
 * relying on recharts/ResponsiveContainer rendering under jsdom (which
 * reports zero width in tests and renders no chart children at all).
 */
export function computeStockHealthSlices(
  lines: readonly StockValuationLineDto[],
): readonly Slice[] {
  const inStockCount = lines.filter((l) => l.quantityOnHandMilli > 0).length;
  const outOfStockCount = lines.length - inStockCount;

  const slices: Slice[] = [];
  if (inStockCount > 0) {
    slices.push({
      name: `In Stock (${String(inStockCount)})`,
      count: inStockCount,
      fill: colors.money.in,
    });
  }
  if (outOfStockCount > 0) {
    slices.push({
      name: `Out (${String(outOfStockCount)})`,
      count: outOfStockCount,
      fill: colors.money.due,
    });
  }
  return slices;
}

export function StockHealthDonut({ lines }: StockHealthDonutProps): React.JSX.Element {
  if (lines.length === 0) {
    return <p className="py-8 text-center text-ink-faint">No data for this period.</p>;
  }

  const slices = computeStockHealthSlices(lines);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={slices}
          dataKey="count"
          nameKey="name"
          innerRadius={60}
          outerRadius={80}
          isAnimationActive={false}
        >
          {slices.map((slice) => (
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- recharts v3 deprecated Cell in favor of the `shape` prop; matches the existing ExpensesReport.tsx Cell usage
            <Cell key={slice.name} fill={slice.fill} />
          ))}
        </Pie>
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
