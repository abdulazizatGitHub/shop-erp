import type { WageMonthRowDto } from '@shop/contracts';
import { Money } from '@shop/shared';
import { colors } from '@shop/ui';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer } from 'recharts';

export interface WageByRoleDonutProps {
  readonly rows: readonly WageMonthRowDto[];
}

interface RoleSlice {
  readonly role: string;
  readonly name: string;
  readonly amountRupees: number;
  readonly fill: string;
}

// Same cycling palette ExpensesReport.tsx already uses for its "By category"
// pie — role is a free-text field (unbounded set), so no fixed per-role
// token exists; this is the established, already-approved solution to the
// identical unbounded-slice-count problem elsewhere in this directory.
const PIE_COLORS = [
  colors.brand.default,
  colors.posAccent.default,
  colors.warning.default,
  colors.success.default,
  colors.danger.default,
  colors.money.due,
];

/**
 * P12-6 — group-by-role aggregation, extracted (same pattern as P12-4's
 * buildDailyCashFlow) so the grouping itself is unit-tested without
 * rendering recharts under jsdom.
 */
export function buildWageByRoleSlices(rows: readonly WageMonthRowDto[]): readonly RoleSlice[] {
  const byRole = new Map<string, number>();
  for (const row of rows) {
    byRole.set(row.staffRole, (byRole.get(row.staffRole) ?? 0) + row.netPaisa);
  }
  return [...byRole.entries()].map(([role, netPaisa], index) => ({
    role,
    name: `${role} (${Money.format(Money.of(netPaisa))})`,
    amountRupees: netPaisa / 100,
    fill: PIE_COLORS[index % PIE_COLORS.length] ?? colors.brand.default,
  }));
}

export function WageByRoleDonut({ rows }: WageByRoleDonutProps): React.JSX.Element {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-ink-faint">No wage data for this period.</p>;
  }

  const slices = buildWageByRoleSlices(rows);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={[...slices]}
          dataKey="amountRupees"
          nameKey="name"
          innerRadius={60}
          outerRadius={80}
          isAnimationActive={false}
        >
          {slices.map((slice) => (
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- recharts v3 deprecated Cell in favor of the `shape` prop; matches the existing ExpensesReport.tsx Cell usage
            <Cell key={slice.role} fill={slice.fill} />
          ))}
        </Pie>
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
