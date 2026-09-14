import { describe, expect, it } from 'vitest';
import type { ReceivablesAgingRowDto } from '@shop/contracts';
import { buildCustomerAgingBars } from './CustomerAgingBarChart.js';

function row(overrides: Partial<ReceivablesAgingRowDto> = {}): ReceivablesAgingRowDto {
  return {
    customerId: 'c1',
    customerName: 'Ali Traders',
    totalBalancePaisa: 0,
    currentPaisa: 0,
    days31To60Paisa: 0,
    days61To90Paisa: 0,
    over90Paisa: 0,
    ...overrides,
  };
}

describe('buildCustomerAgingBars (P12-2)', () => {
  it('divides each bucket by 100 for display, per customer', () => {
    const bars = buildCustomerAgingBars([
      row({
        customerName: 'Ali Traders',
        currentPaisa: 500_000,
        days31To60Paisa: 200_000,
        days61To90Paisa: 100_000,
        over90Paisa: 50_000,
      }),
    ]);

    expect(bars).toEqual([
      {
        customerName: 'Ali Traders',
        withinRupees: 5000,
        days31To60Rupees: 2000,
        days61To90Rupees: 1000,
        over90Rupees: 500,
      },
    ]);
  });

  it('returns one bar per input row, preserving order', () => {
    const bars = buildCustomerAgingBars([row({ customerName: 'A' }), row({ customerName: 'B' })]);
    expect(bars.map((b) => b.customerName)).toEqual(['A', 'B']);
  });

  it('returns an empty array for no rows', () => {
    expect(buildCustomerAgingBars([])).toEqual([]);
  });
});
