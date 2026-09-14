import type { DayBucketDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { EmptyState, colors } from '@shop/ui';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface CashCreditPieProps {
  readonly current: readonly DayBucketDto[];
}

interface Slice {
  readonly name: string;
  readonly amountRupees: number;
  readonly amountPaisa: number;
}

// recharts v3's Tooltip formatter type is a strict intersection that a
// narrowly-typed function doesn't structurally satisfy — accept unknown
// and narrow internally instead (still no `any`, per CODING_STANDARDS.md).
function formatSliceTooltip(_value: unknown, _name: unknown, item: unknown): string {
  const payload = (item as { payload?: Slice }).payload;
  return Money.format(Money.of(payload?.amountPaisa ?? 0));
}

function legendLabel(value: string, entry: unknown): string {
  const payload = (entry as { payload?: Slice }).payload;
  const formattedAmount = Money.format(Money.of(payload?.amountPaisa ?? 0));
  return `${value}: ${formattedAmount}`;
}

/**
 * P11-5 Section 4 — Cash vs Credit uses colors.money.in/colors.money.due
 * (not colors.success/colors.warning): these two slices are money
 * concepts (received / outstanding), and colors.ts's own comment says the
 * money vocabulary and the UI-state vocabulary are kept deliberately
 * distinct — the same tone MoneyDisplay's tone="in"/tone="due" already use
 * for these exact two concepts elsewhere in this file.
 */
export function CashCreditPie({ current }: CashCreditPieProps): React.JSX.Element {
  const cashPaisa = Money.sum(current.map((row) => Money.of(row.cashPaisa)));
  const creditPaisa = Money.sum(current.map((row) => Money.of(row.creditPaisa)));

  if (cashPaisa === 0 && creditPaisa === 0) {
    return <EmptyState message="No sales in this period." />;
  }

  const slices: readonly Slice[] = [
    { name: 'Cash', amountRupees: cashPaisa / 100, amountPaisa: cashPaisa },
    { name: 'Credit', amountRupees: creditPaisa / 100, amountPaisa: creditPaisa },
  ];
  const sliceColors = [colors.money.in, colors.money.due];

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={[...slices]}
          dataKey="amountRupees"
          nameKey="name"
          outerRadius={80}
          isAnimationActive={false}
        >
          {slices.map((slice, index) => (
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- recharts v3 deprecated Cell in favor of the `shape` prop; kept per the existing ExpensesReport.tsx precedent (P10-4) rather than migrating mid-phase
            <Cell key={slice.name} fill={sliceColors[index] ?? colors.brand.default} />
          ))}
        </Pie>
        <Tooltip formatter={formatSliceTooltip} />
        <Legend formatter={legendLabel} />
      </PieChart>
    </ResponsiveContainer>
  );
}
