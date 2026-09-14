import type { CashBookRowDto } from '@shop/contracts';
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

export interface DailyCashFlowChartProps {
  readonly rows: readonly CashBookRowDto[];
}

interface DailyFlow {
  readonly date: string;
  readonly inRupees: number;
  readonly inPaisa: number;
  readonly outRupees: number;
  readonly outPaisa: number;
}

/**
 * P12-4 — real aggregation (group by date, sum in/out), unlike P12-2's
 * simple per-row division, so extracted and unit-tested on its own. A date
 * with only inPaisa (or only outPaisa) still produces a full DailyFlow row
 * with the other side at 0 — grouped bars render a zero-height bar for that
 * side rather than omitting it, so every date's two bars stay aligned.
 */
export function buildDailyCashFlow(rows: readonly CashBookRowDto[]): readonly DailyFlow[] {
  const byDate = new Map<string, { inPaisa: number; outPaisa: number }>();
  for (const row of rows) {
    const existing = byDate.get(row.date) ?? { inPaisa: 0, outPaisa: 0 };
    byDate.set(row.date, {
      inPaisa: existing.inPaisa + row.inPaisa,
      outPaisa: existing.outPaisa + row.outPaisa,
    });
  }
  return [...byDate.entries()].map(([date, totals]) => ({
    date,
    // divide paisa by 100 for chart display only
    inRupees: totals.inPaisa / 100,
    inPaisa: totals.inPaisa,
    outRupees: totals.outPaisa / 100,
    outPaisa: totals.outPaisa,
  }));
}

// recharts v3's Tooltip formatter type is a strict intersection that a
// narrowly-typed function doesn't structurally satisfy — accept unknown
// and narrow internally instead (still no `any`, per CODING_STANDARDS.md).
function formatFlowTooltip(_value: unknown, name: unknown, item: unknown): string {
  const payload = (item as { payload?: DailyFlow }).payload;
  const paisa = name === 'Cash In' ? payload?.inPaisa : payload?.outPaisa;
  return Money.format(Money.of(paisa ?? 0));
}

/**
 * P12-4 — grouped (not stacked) bar per date: Cash In vs Cash Out, so the
 * owner sees what moved each day before the Running Balance trend line.
 */
export function DailyCashFlowChart({ rows }: DailyCashFlowChartProps): React.JSX.Element {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-ink-faint">No transactions in this period.</p>;
  }

  const data = buildDailyCashFlow(rows);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={[...data]}>
        <CartesianGrid stroke={colors.line.default} vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 12, fill: colors.ink.muted }} />
        <YAxis tick={{ fontSize: 12, fill: colors.ink.muted }} />
        <Tooltip formatter={formatFlowTooltip} />
        <Legend />
        <Bar dataKey="inRupees" name="Cash In" fill={colors.money.in} isAnimationActive={false} />
        <Bar
          dataKey="outRupees"
          name="Cash Out"
          fill={colors.money.out}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
