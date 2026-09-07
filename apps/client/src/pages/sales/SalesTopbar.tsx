import { useEffect, useState } from 'react';

function formatClock(date: Date): string {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** 52px topbar for the sale screen: title, session pill, keyboard hints, live clock. Visual only — no state, no IPC. */
export function SalesTopbar(): React.JSX.Element {
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
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-line bg-surface-input px-1.5 py-0.5 font-mono">
            ↑↓ Enter
          </kbd>
          add item
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-line bg-surface-input px-1.5 py-0.5 font-mono">
            C / U
          </kbd>
          cash · udhaar
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-line bg-surface-input px-1.5 py-0.5 font-mono">
            F10
          </kbd>
          complete
        </span>
        <span className="text-line" aria-hidden="true">
          |
        </span>
        <span className="font-mono text-ink-muted" aria-label="Current time">
          {formatClock(now)}
        </span>
      </div>
    </div>
  );
}
