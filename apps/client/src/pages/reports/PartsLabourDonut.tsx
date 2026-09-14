import { colors } from '@shop/ui';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer } from 'recharts';

export interface PartsLabourDonutProps {
  readonly partsMarginPaisa: number;
  readonly labourChargePaisa: number;
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
 * P12-3 — pure slice construction, extracted (same pattern as P12-1's
 * computeStockHealthSlices) so the "both zero" guard and slice labels are
 * unit-testable without rendering recharts under jsdom.
 */
export function buildPartsLabourSlices(
  partsMarginPaisa: number,
  labourChargePaisa: number,
): readonly Slice[] {
  const slices: Slice[] = [];
  if (partsMarginPaisa > 0) {
    slices.push({
      name: `Parts Margin (${formatRs(partsMarginPaisa)})`,
      amountRupees: partsMarginPaisa / 100,
      fill: colors.money.in,
    });
  }
  if (labourChargePaisa > 0) {
    slices.push({
      name: `Labour Revenue (${formatRs(labourChargePaisa)})`,
      amountRupees: labourChargePaisa / 100,
      fill: colors.ink.default,
    });
  }
  return slices;
}

export function PartsLabourDonut({
  partsMarginPaisa,
  labourChargePaisa,
}: PartsLabourDonutProps): React.JSX.Element {
  if (partsMarginPaisa <= 0 && labourChargePaisa <= 0) {
    return <p className="py-8 text-center text-ink-faint">No jobs in this period.</p>;
  }

  const slices = buildPartsLabourSlices(partsMarginPaisa, labourChargePaisa);

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
