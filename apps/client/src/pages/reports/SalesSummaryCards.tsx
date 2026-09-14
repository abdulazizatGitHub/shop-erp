import type { DayBucketDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { MoneyDisplay, colors } from '@shop/ui';
import { Line, LineChart, ResponsiveContainer } from 'recharts';

export interface SalesSummaryCardsProps {
  readonly current: readonly DayBucketDto[];
  readonly previous: readonly DayBucketDto[];
  /** The selected range's start date — used as the synthetic sparkline point's date when `current` is empty. */
  readonly from: string;
}

type DayBucketNumberKey = 'totalPaisa' | 'cashPaisa' | 'creditPaisa' | 'transactionCount';

function sumField(rows: readonly DayBucketDto[], key: DayBucketNumberKey): number {
  if (key === 'transactionCount') {
    return rows.reduce((acc, row) => acc + row.transactionCount, 0);
  }
  return Money.sum(rows.map((row) => Money.of(row[key])));
}

interface SparklinePoint {
  readonly date: string;
  readonly value: number;
}

/**
 * P11-5 — 0 points: a single synthetic { date: from, value: 0 } point, so
 * the sparkline never renders an empty recharts container. Exactly 1
 * point: duplicated, since recharts cannot draw a line from a single
 * point. Both cases collapse to the same "duplicate the only point" step.
 */
function toSparklineData(
  current: readonly DayBucketDto[],
  from: string,
  key: DayBucketNumberKey,
): readonly SparklinePoint[] {
  const points: SparklinePoint[] =
    current.length === 0
      ? [{ date: from, value: 0 }]
      : current.map((row) => ({ date: row.date, value: row[key] }));
  const [first] = points;
  return points.length === 1 && first ? [first, first] : points;
}

function formatTrend(
  current: number,
  previous: number,
): { readonly text: string; readonly colorClass: string } {
  if (previous === 0) {
    return { text: '— vs prev period', colorClass: 'text-ink-faint' };
  }
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  const sign = pct > 0 ? '+' : '';
  const colorClass = pct > 0 ? 'text-success' : pct < 0 ? 'text-danger' : 'text-ink-faint';
  return { text: `${sign}${String(pct)}% vs prev period`, colorClass };
}

/** No axes/grid/tooltip/legend — just the line, filling the card at a fixed 40px height. */
function Sparkline({ data }: { readonly data: readonly SparklinePoint[] }): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={[...data]}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={colors.brand.default}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface SummaryCardProps {
  readonly label: string;
  readonly currentValue: number;
  readonly previousValue: number;
  readonly isMoney: boolean;
  readonly moneyTone?: 'in' | 'due';
  readonly sparklineData: readonly SparklinePoint[];
}

function SummaryCard({
  label,
  currentValue,
  previousValue,
  isMoney,
  moneyTone,
  sparklineData,
}: SummaryCardProps): React.JSX.Element {
  const trend = formatTrend(currentValue, previousValue);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <div>
        {isMoney ? (
          <MoneyDisplay
            paisaValue={currentValue}
            size="xl"
            {...(moneyTone !== undefined ? { tone: moneyTone } : {})}
          />
        ) : (
          <span className="font-mono text-xl tabular-nums text-ink">{currentValue}</span>
        )}
      </div>
      <p className={`text-xs ${trend.colorClass}`}>{trend.text}</p>
      <Sparkline data={sparklineData} />
    </div>
  );
}

/**
 * P11-5 Section 2 — 4 summary cards (Total Sales, Cash, Credit,
 * Transactions), each with a trend indicator vs. the previous period
 * (report:periodComparison) and a sparkline of the current period's
 * day-by-day values.
 */
export function SalesSummaryCards({
  current,
  previous,
  from,
}: SalesSummaryCardsProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-4 gap-4">
      <SummaryCard
        label="Total Sales"
        currentValue={sumField(current, 'totalPaisa')}
        previousValue={sumField(previous, 'totalPaisa')}
        isMoney
        sparklineData={toSparklineData(current, from, 'totalPaisa')}
      />
      <SummaryCard
        label="Cash"
        currentValue={sumField(current, 'cashPaisa')}
        previousValue={sumField(previous, 'cashPaisa')}
        isMoney
        moneyTone="in"
        sparklineData={toSparklineData(current, from, 'cashPaisa')}
      />
      <SummaryCard
        label="Credit"
        currentValue={sumField(current, 'creditPaisa')}
        previousValue={sumField(previous, 'creditPaisa')}
        isMoney
        moneyTone="due"
        sparklineData={toSparklineData(current, from, 'creditPaisa')}
      />
      <SummaryCard
        label="Transactions"
        currentValue={sumField(current, 'transactionCount')}
        previousValue={sumField(previous, 'transactionCount')}
        isMoney={false}
        sparklineData={toSparklineData(current, from, 'transactionCount')}
      />
    </div>
  );
}
