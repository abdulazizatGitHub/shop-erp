import { describe, expect, it } from 'vitest';
import type { CashBookRowDto } from '@shop/contracts';
import { buildDailyCashFlow } from './DailyCashFlowChart.js';

function row(overrides: Partial<CashBookRowDto> = {}): CashBookRowDto {
  return {
    date: '2026-09-01',
    docNo: 'DOC-1',
    description: 'test',
    inPaisa: 0,
    outPaisa: 0,
    runningBalancePaisa: 0,
    ...overrides,
  };
}

describe('buildDailyCashFlow (P12-4)', () => {
  it('sums multiple rows on the same date into one grouped entry', () => {
    const flow = buildDailyCashFlow([
      row({ date: '2026-09-01', inPaisa: 100_000, outPaisa: 0 }),
      row({ date: '2026-09-01', inPaisa: 50_000, outPaisa: 20_000 }),
    ]);
    expect(flow).toEqual([
      { date: '2026-09-01', inRupees: 1500, inPaisa: 150_000, outRupees: 200, outPaisa: 20_000 },
    ]);
  });

  it('a date with only inPaisa produces a full row with outRupees=0, not an omitted bar', () => {
    const flow = buildDailyCashFlow([row({ date: '2026-09-02', inPaisa: 80_000, outPaisa: 0 })]);
    expect(flow).toEqual([
      { date: '2026-09-02', inRupees: 800, inPaisa: 80_000, outRupees: 0, outPaisa: 0 },
    ]);
  });

  it('a date with only outPaisa produces a full row with inRupees=0, not an omitted bar', () => {
    const flow = buildDailyCashFlow([row({ date: '2026-09-03', inPaisa: 0, outPaisa: 30_000 })]);
    expect(flow).toEqual([
      { date: '2026-09-03', inRupees: 0, inPaisa: 0, outRupees: 300, outPaisa: 30_000 },
    ]);
  });

  it('returns one entry per distinct date, in first-seen order', () => {
    const flow = buildDailyCashFlow([
      row({ date: '2026-09-01' }),
      row({ date: '2026-09-03' }),
      row({ date: '2026-09-01' }),
    ]);
    expect(flow.map((f) => f.date)).toEqual(['2026-09-01', '2026-09-03']);
  });

  it('returns an empty array for no rows', () => {
    expect(buildDailyCashFlow([])).toEqual([]);
  });
});
