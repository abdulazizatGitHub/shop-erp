import { colors } from '@shop/ui';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer } from 'recharts';

export interface RevenueMarginDonutProps {
  readonly directMarginPaisa: number;
  readonly cogsPaisa: number;
}

interface Slice {
  readonly name: string;
  readonly amountRupees: number;
  readonly fill: string;
}

function formatRs(paisa: number): string {
  return `Rs ${(paisa / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * P12-5 — pure slice construction (same pattern as P12-1/P12-3) so the
 * "both zero" guard and slice labels are unit-testable without rendering
 * recharts under jsdom.
 */
export function buildRevenueMarginSlices(
  directMarginPaisa: number,
  cogsPaisa: number,
): readonly Slice[] {
  const slices: Slice[] = [];
  if (directMarginPaisa > 0) {
    slices.push({
      name: `Direct Margin (${formatRs(directMarginPaisa)})`,
      amountRupees: directMarginPaisa / 100,
      fill: colors.success.default,
    });
  }
  if (cogsPaisa > 0) {
    slices.push({
      name: `COGS (${formatRs(cogsPaisa)})`,
      amountRupees: cogsPaisa / 100,
      fill: colors.warning.default,
    });
  }
  return slices;
}

/**
 * P12-5 — driven by the report's own pre-computed TOTAL row (directMarginPaisa/
 * cogsPaisa summed server-side across PARTS+REPAIR), not re-summed here.
 */
export function RevenueMarginDonut({
  directMarginPaisa,
  cogsPaisa,
}: RevenueMarginDonutProps): React.JSX.Element {
  if (directMarginPaisa <= 0 && cogsPaisa <= 0) {
    return <p className="py-8 text-center text-ink-faint">No data for this period.</p>;
  }

  const slices = buildRevenueMarginSlices(directMarginPaisa, cogsPaisa);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={slices}
          dataKey="amountRupees"
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
