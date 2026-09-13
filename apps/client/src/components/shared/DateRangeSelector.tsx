import { useState } from 'react';
import {
  getThisMonth,
  getThisQuarter,
  getThisWeek,
  getThisYear,
  getToday,
  type DateRange,
} from '../../utils/dateRanges.js';

export interface DateRangeSelectorProps {
  readonly value: DateRange;
  readonly onChange: (range: DateRange) => void;
  /** Injectable for tests — defaults to `new Date()` when omitted. Real
   * callers never pass this; it exists only so a preset click can be
   * asserted against a fixed date instead of the actual current date. */
  readonly referenceDate?: Date;
}

const PRESETS: readonly { key: string; label: string; compute: (reference: Date) => DateRange }[] =
  [
    { key: 'today', label: 'Today', compute: getToday },
    { key: 'thisWeek', label: 'This Week', compute: getThisWeek },
    { key: 'thisMonth', label: 'This Month', compute: getThisMonth },
    { key: 'thisQuarter', label: 'This Quarter', compute: getThisQuarter },
    { key: 'thisYear', label: 'This Year', compute: getThisYear },
  ];

const BUTTON_CLASS =
  'rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:border-brand hover:text-brand';

/**
 * P10-3 — shared date-range picker: five presets (each backed by a pure
 * function from utils/dateRanges.ts) plus a Custom mode with two native
 * date inputs. Presets always compute from `referenceDate ?? new Date()` —
 * real() usage never supplies referenceDate, so it is always "now"; tests
 * supply a fixed Date to make preset clicks deterministic.
 */
export function DateRangeSelector({
  value,
  onChange,
  referenceDate,
}: DateRangeSelectorProps): React.JSX.Element {
  const [customMode, setCustomMode] = useState(false);

  function selectPreset(compute: (reference: Date) => DateRange): void {
    setCustomMode(false);
    onChange(compute(referenceDate ?? new Date()));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((preset) => (
        <button
          key={preset.key}
          type="button"
          className={BUTTON_CLASS}
          onClick={() => {
            selectPreset(preset.compute);
          }}
        >
          {preset.label}
        </button>
      ))}
      <button
        type="button"
        className={BUTTON_CLASS}
        onClick={() => {
          setCustomMode(true);
        }}
      >
        Custom
      </button>

      {customMode && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value.from}
            onChange={(e) => {
              onChange({ from: e.target.value, to: value.to });
            }}
            className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
          />
          <span className="text-sm text-ink-faint">to</span>
          <input
            type="date"
            value={value.to}
            onChange={(e) => {
              onChange({ from: value.from, to: e.target.value });
            }}
            className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-brand focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-focus"
          />
        </div>
      )}
    </div>
  );
}
