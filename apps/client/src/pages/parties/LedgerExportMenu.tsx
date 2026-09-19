import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import type { CustomerLedgerRowDto } from '@shop/contracts';
import { DESCRIPTIONS } from './ledger-entry-descriptions.js';

export interface LedgerExportMenuProps {
  readonly rows: readonly CustomerLedgerRowDto[];
  readonly customerCode: string;
}

type RangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';

const RANGE_LABELS: Record<RangeOption, string> = {
  all: 'Export all entries',
  thisMonth: 'Export this month',
  lastMonth: 'Export last month',
  custom: 'Custom range',
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function monthRange(monthsAgo: number): { from: string; to: string; yearMonth: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() - monthsAgo;
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const yearMonth = `${String(first.getFullYear())}-${pad2(first.getMonth() + 1)}`;
  return {
    from: `${String(first.getFullYear())}-${pad2(first.getMonth() + 1)}-${pad2(first.getDate())}`,
    to: `${String(last.getFullYear())}-${pad2(last.getMonth() + 1)}-${pad2(last.getDate())}`,
    yearMonth,
  };
}

/** Quotes a CSV field only when it contains a comma, quote, or newline. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toRupees(paisa: number): string {
  return (paisa / 100).toFixed(2);
}

function buildCsv(rows: readonly CustomerLedgerRowDto[]): string {
  const header = [
    'Date',
    'Type',
    'Reference',
    'Description',
    'Debit (Rs)',
    'Credit (Rs)',
    'Balance (Rs)',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    const reference = row.saleDocNo ?? row.paymentDocNo ?? row.billReference ?? '';
    const description = DESCRIPTIONS[row.entryType] ?? row.entryType;
    const debit = row.amountPaisa > 0 ? toRupees(row.amountPaisa) : '';
    const credit = row.amountPaisa < 0 ? toRupees(Math.abs(row.amountPaisa)) : '';
    const runningBalanceRupees = toRupees(row.runningBalancePaisa);
    lines.push(
      [
        csvField(row.entryDate),
        csvField(row.entryType),
        csvField(reference),
        csvField(description),
        debit,
        credit,
        runningBalanceRupees,
      ].join(','),
    );
  }
  return lines.join('\n');
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Client-side CSV export — no new IPC, filters the already-fetched `rows` prop by date range. */
export function LedgerExportMenu({ rows, customerCode }: LedgerExportMenuProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setCustomRangeOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  function exportRange(option: Exclude<RangeOption, 'custom'>): void {
    if (option === 'all') {
      downloadCsv(`ledger-${customerCode}-all.csv`, buildCsv(rows));
    } else {
      const monthsAgo = option === 'thisMonth' ? 0 : 1;
      const { from, to, yearMonth } = monthRange(monthsAgo);
      const filtered = rows.filter((r) => r.entryDate >= from && r.entryDate <= to);
      downloadCsv(`ledger-${customerCode}-${yearMonth}.csv`, buildCsv(filtered));
    }
    setMenuOpen(false);
    setCustomRangeOpen(false);
  }

  function exportCustomRange(): void {
    if (fromDate.length === 0 || toDate.length === 0) return;
    const filtered = rows.filter((r) => r.entryDate >= fromDate && r.entryDate <= toDate);
    downloadCsv(`ledger-${customerCode}-${fromDate}-to-${toDate}.csv`, buildCsv(filtered));
    setMenuOpen(false);
    setCustomRangeOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setMenuOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:border-brand hover:text-brand"
      >
        <Download size={14} aria-hidden="true" />
        Export CSV
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-md border border-line bg-surface py-1 shadow-lg">
          {(['all', 'thisMonth', 'lastMonth'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                exportRange(option);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-surface-sunken"
            >
              {RANGE_LABELS[option]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCustomRangeOpen((v) => !v);
            }}
            className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-surface-sunken"
          >
            {RANGE_LABELS.custom}
          </button>
          {customRangeOpen && (
            <div className="flex flex-col gap-2 border-t border-line px-3 py-2">
              <label className="flex flex-col gap-0.5 text-xs text-ink-muted">
                From
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                  }}
                  className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-xs text-ink-muted">
                To
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                  }}
                  className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
                />
              </label>
              <button
                type="button"
                onClick={exportCustomRange}
                disabled={fromDate.length === 0 || toDate.length === 0}
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                Export
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
