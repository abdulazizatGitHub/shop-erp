/**
 * P10-3 — pure date-range functions for DateRangeSelector's presets.
 * Every function takes a reference Date and never calls new Date()/
 * Date.now() internally, so behavior is fully deterministic and testable
 * with a fixed date. All arithmetic runs in UTC (the getUTC accessors and
 * Date.UTC) to avoid the local-timezone drift a plain Date-only string can
 * otherwise introduce (e.g. new Date('2026-09-13') parses as UTC midnight).
 */

export interface DateRange {
  readonly from: string;
  readonly to: string;
}

interface DateParts {
  readonly year: number;
  readonly month: number; // 0-indexed, matches Date's own convention
  readonly day: number;
}

function utcParts(reference: Date): DateParts {
  return {
    year: reference.getUTCFullYear(),
    month: reference.getUTCMonth(),
    day: reference.getUTCDate(),
  };
}

function isoDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/** Today only: from === to. */
export function getToday(reference: Date): DateRange {
  const { year, month, day } = utcParts(reference);
  const iso = isoDate(year, month, day);
  return { from: iso, to: iso };
}

/** ISO week, Monday start. Sunday's offset (-6) is the one non-uniform case. */
export function getThisWeek(reference: Date): DateRange {
  const { year, month, day } = utcParts(reference);
  const dayOfWeek = new Date(Date.UTC(year, month, day)).getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return {
    from: isoDate(year, month, day + diffToMonday),
    to: isoDate(year, month, day + diffToMonday + 6),
  };
}

/** First to last day of the reference's month. */
export function getThisMonth(reference: Date): DateRange {
  const { year, month } = utcParts(reference);
  return {
    from: isoDate(year, month, 1),
    // day 0 of next month = last day of this month
    to: isoDate(year, month + 1, 0),
  };
}

/** Q1 Jan-Mar, Q2 Apr-Jun, Q3 Jul-Sep, Q4 Oct-Dec. */
export function getThisQuarter(reference: Date): DateRange {
  const { year, month } = utcParts(reference);
  const quarterStartMonth = Math.floor(month / 3) * 3;
  return {
    from: isoDate(year, quarterStartMonth, 1),
    to: isoDate(year, quarterStartMonth + 3, 0),
  };
}

/** Jan 1 to Dec 31 of the reference's year. */
export function getThisYear(reference: Date): DateRange {
  const { year } = utcParts(reference);
  return {
    from: isoDate(year, 0, 1),
    to: isoDate(year, 11, 31),
  };
}

function parseIso(dateStr: string): DateParts {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year: year ?? 0, month: (month ?? 1) - 1, day: day ?? 1 };
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = parseIso(fromIso);
  const to = parseIso(toIso);
  return Math.round(
    (Date.UTC(to.year, to.month, to.day) - Date.UTC(from.year, from.month, from.day)) / 86400000,
  );
}

/**
 * P11-4a — the period immediately preceding `current`, of the same length,
 * ending the day before current.from. E.g. current Sep 1-13 (13 days) ->
 * previous Aug 19-31 (the 13 days immediately before). Pure millisecond
 * arithmetic in UTC — no re-parsing of a computed date, so no double
 * normalization step to reason about.
 */
export function getPreviousPeriod(current: DateRange): DateRange {
  const durationDays = daysBetween(current.from, current.to) + 1;
  const { year, month, day } = parseIso(current.from);
  const currentFromMs = Date.UTC(year, month, day);
  const previousToMs = currentFromMs - 86400000;
  const previousFromMs = previousToMs - (durationDays - 1) * 86400000;
  return {
    from: new Date(previousFromMs).toISOString().slice(0, 10),
    to: new Date(previousToMs).toISOString().slice(0, 10),
  };
}
