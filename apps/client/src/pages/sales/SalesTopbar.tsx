import { useEffect, useState } from 'react';

function formatClock(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * Built from fixed tables rather than toLocaleDateString: en-GB's short
 * month abbreviates September as "Sept" (4 letters) in this environment's
 * ICU data, while en-US gives the desired 3-letter "Sep" but orders month
 * before day. Neither locale alone matches the spec's "Mon, 7 Sep" shape.
 */
function formatDate(date: Date): string {
  const weekday: string = WEEKDAYS[date.getDay()] ?? '';
  const month: string = MONTHS[date.getMonth()] ?? '';
  return `${weekday}, ${String(date.getDate())} ${month}`;
}

export interface SalesTopbarProps {
  readonly onHelpClick: () => void;
}

/** 52px topbar for the sale screen: title, session pill, Help button, live clock. Visual only — no IPC. */
export function SalesTopbar({ onHelpClick }: SalesTopbarProps): React.JSX.Element {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-line bg-surface px-4">
      <div className="flex items-center gap-3">
        <span className="text-[15px] font-bold text-ink">Counter sale</span>
        <span className="text-line" aria-hidden="true">
          |
        </span>
        {/* decorative — wire to real cash session state in a future phase */}
        <span className="flex items-center gap-1.5 rounded-full bg-success-subtle px-2.5 py-1 text-xs font-medium text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
          Session open
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-ink-faint">
        <button
          type="button"
          onClick={onHelpClick}
          className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-ink-muted hover:bg-surface-sunken hover:text-ink"
        >
          <kbd className="rounded border border-line bg-surface-input px-1.5 py-0.5 font-mono">
            ?
          </kbd>
          Help
        </button>
        <span className="text-line" aria-hidden="true">
          |
        </span>
        <span
          className="whitespace-nowrap text-[13px] font-semibold text-ink-muted"
          aria-label="Current date and time"
        >
          {formatDate(now)}
          <span className="mx-1.5 text-line" aria-hidden="true">
            ·
          </span>
          {formatClock(now)}
        </span>
      </div>
    </div>
  );
}
