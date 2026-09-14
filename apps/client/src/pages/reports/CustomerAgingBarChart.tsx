import type { ReceivablesAgingRowDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { colors } from '@shop/ui';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface CustomerAgingBarChartProps {
  readonly rows: readonly ReceivablesAgingRowDto[];
}

interface CustomerAgingBar {
  readonly customerName: string;
  readonly withinRupees: number;
  readonly days31To60Rupees: number;
  readonly days61To90Rupees: number;
  readonly over90Rupees: number;
}

/**
 * P12-2 — pure mapping, extracted (matching this tab's own existing
 * buildBuckets() pattern in ReceivablesAgingReport.tsx) so the per-customer
 * bucket math is unit-testable without rendering recharts under jsdom.
 */
export function buildCustomerAgingBars(
  rows: readonly ReceivablesAgingRowDto[],
): readonly CustomerAgingBar[] {
  return rows.map((row) => ({
    customerName: row.customerName,
    // divide paisa by 100 for chart display only
    withinRupees: row.currentPaisa / 100,
    days31To60Rupees: row.days31To60Paisa / 100,
    days61To90Rupees: row.days61To90Paisa / 100,
    over90Rupees: row.over90Paisa / 100,
  }));
}

function formatBucketTooltip(value: unknown): string {
  return Money.format(Money.of(Math.round(Number(value) * 100)));
}

/**
 * P12-2 — stacked horizontal bar, one bar per customer, showing how their
 * total debt splits across the four aging buckets, so the owner can see at
 * a glance both who owes the most and how old that debt is.
 */
export function CustomerAgingBarChart({ rows }: CustomerAgingBarChartProps): React.JSX.Element {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-ink-faint">No data for this period.</p>;
  }

  const bars = buildCustomerAgingBars(rows);
  const height = Math.max(240, bars.length * 40);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={[...bars]} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid stroke={colors.line.default} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 12, fill: colors.ink.muted }} />
        <YAxis
          type="category"
          dataKey="customerName"
          width={140}
          tick={{ fontSize: 12, fill: colors.ink.muted }}
        />
        <Tooltip formatter={formatBucketTooltip} />
        <Legend />
        <Bar
          dataKey="withinRupees"
          name="Within 30 days"
          stackId="aging"
          fill={colors.success.default}
          isAnimationActive={false}
        />
        <Bar
          dataKey="days31To60Rupees"
          name="30–60 days old"
          stackId="aging"
          fill={colors.money.due}
          isAnimationActive={false}
        />
        <Bar
          dataKey="days61To90Rupees"
          name="60–90 days old"
          stackId="aging"
          fill={colors.warning.default}
          isAnimationActive={false}
        />
        <Bar
          dataKey="over90Rupees"
          name="Over 90 days"
          stackId="aging"
          fill={colors.danger.default}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
