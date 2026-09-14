import type { DayBucketDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { EmptyState, colors } from '@shop/ui';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface DateRangeLike {
  readonly from: string;
  readonly to: string;
}

export interface SalesTrendChartProps {
  readonly current: readonly DayBucketDto[];
  readonly previous: readonly DayBucketDto[];
  readonly currentRange: DateRangeLike;
  readonly previousRange: DateRangeLike;
}

interface TrendPoint {
  readonly date: string;
  readonly currentRupees: number;
  readonly currentPaisa: number;
  readonly previousRupees: number;
  readonly previousPaisa: number;
}

/** One entry per UTC calendar day in [from, to], inclusive — same midnight arithmetic as dateRanges.ts's getPreviousPeriod. */
function eachDateInRange(from: string, to: string): readonly string[] {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const startMs = Date.UTC(fy ?? 0, (fm ?? 1) - 1, fd ?? 1);
  const endMs = Date.UTC(ty ?? 0, (tm ?? 1) - 1, td ?? 1);
  const dates: string[] = [];
  for (let ms = startMs; ms <= endMs; ms += 86400000) {
    dates.push(new Date(ms).toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * P11-5 Section 3 — v_daily_sales only returns dates with at least one
 * confirmed sale, so `current`/`previous` are sparse on their own. This
 * enumerates every calendar day in each range and looks up that day's
 * bucket (0 if none), producing two full, gap-free, identical-length
 * series — `previousRange` has the same day count as `currentRange` by
 * construction (dateRanges.ts's getPreviousPeriod), so previousDates[i]
 * is the day-offset-aligned counterpart of currentDates[i], time-shifted
 * onto the current period's date axis for a true day-by-day comparison.
 */
function buildTrendData(
  current: readonly DayBucketDto[],
  previous: readonly DayBucketDto[],
  currentRange: DateRangeLike,
  previousRange: DateRangeLike,
): readonly TrendPoint[] {
  const currentDates = eachDateInRange(currentRange.from, currentRange.to);
  const previousDates = eachDateInRange(previousRange.from, previousRange.to);
  const currentByDate = new Map(current.map((row) => [row.date, row.totalPaisa]));
  const previousByDate = new Map(previous.map((row) => [row.date, row.totalPaisa]));

  return currentDates.map((date, index) => {
    const currentPaisa = currentByDate.get(date) ?? 0;
    const previousDate = previousDates[index];
    const previousPaisa = previousDate !== undefined ? (previousByDate.get(previousDate) ?? 0) : 0;
    return {
      date,
      // divide paisa by 100 for display only
      currentRupees: currentPaisa / 100,
      currentPaisa,
      previousRupees: previousPaisa / 100,
      previousPaisa,
    };
  });
}

// recharts v3's Tooltip formatter type is a strict intersection that a
// narrowly-typed function doesn't structurally satisfy — accept unknown
// and narrow internally instead (still no `any`, per CODING_STANDARDS.md).
function formatTrendTooltip(_value: unknown, name: unknown, item: unknown): string {
  const payload = (item as { payload?: TrendPoint }).payload;
  const paisa = name === 'This period' ? payload?.currentPaisa : payload?.previousPaisa;
  return Money.format(Money.of(paisa ?? 0));
}

export function SalesTrendChart({
  current,
  previous,
  currentRange,
  previousRange,
}: SalesTrendChartProps): React.JSX.Element {
  if (current.length === 0 && previous.length === 0) {
    return <EmptyState message="No sales in this period." />;
  }

  const data = buildTrendData(current, previous, currentRange, previousRange);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={[...data]}>
        <CartesianGrid stroke={colors.line.default} vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 12, fill: colors.ink.muted }} />
        <YAxis tick={{ fontSize: 12, fill: colors.ink.muted }} />
        <Tooltip formatter={formatTrendTooltip} />
        <Line
          type="monotone"
          dataKey="currentRupees"
          name="This period"
          stroke={colors.brand.default}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="previousRupees"
          name="Previous period"
          stroke={colors.ink.faint}
          strokeDasharray="4 4"
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
