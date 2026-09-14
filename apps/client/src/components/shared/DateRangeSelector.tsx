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

const INACTIVE_BUTTON_CLASS =
  'rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:border-brand hover:text-brand';

const ACTIVE_BUTTON_CLASS =
  'rounded-md border border-brand bg-brand px-3 py-1.5 text-sm font-medium text-white transition-colors';

function sameRange(a: DateRange, b: DateRange): boolean {
  return a.from === b.from && a.to === b.to;
}

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

  // The active preset is derived from `value` itself (compared against what
  // each preset would compute right now), not tracked as separate "last
  // clicked" state — stays truthful even if `value` is ever set some other
  // way, and needs zero prop/caller changes across the other 7 report tabs
  // that also render this component.
  const reference = referenceDate ?? new Date();
  const activeKey = customMode
    ? 'custom'
    : (PRESETS.find((preset) => sameRange(preset.compute(reference), value))?.key ?? null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((preset) => (
        <button
          key={preset.key}
          type="button"
          aria-current={activeKey === preset.key ? 'true' : undefined}
          className={activeKey === preset.key ? ACTIVE_BUTTON_CLASS : INACTIVE_BUTTON_CLASS}
          onClick={() => {
            selectPreset(preset.compute);
          }}
        >
          {preset.label}
        </button>
      ))}
      <button
        type="button"
        aria-current={activeKey === 'custom' ? 'true' : undefined}
        className={activeKey === 'custom' ? ACTIVE_BUTTON_CLASS : INACTIVE_BUTTON_CLASS}
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
