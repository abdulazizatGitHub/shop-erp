import { useEffect, useRef, useState } from 'react';
import { ipc } from '../../lib/ipc.js';

/**
 * Phase 18, go-live criterion 5 (BUG-33) — warns the operator that a
 * sale entered while no cash session is open will not be picked up by
 * today's cash count.
 *
 * `cashSession:today` resolves the currently-OPEN session or null and
 * nothing else (Phase 17.5 R8 — see cash-session.service.ts
 * `getOpenSession`), so `null` alone means "no session open": both the
 * never-opened case and the already-closed case, which is the one
 * BUG-33 is actually about.
 *
 * Non-blocking by design: this only reports state, it never gates
 * checkout. A late sale is a legitimate thing to record — the operator
 * just needs to know it falls outside the count.
 *
 * Dismissal is per visit, held in component state: navigating away and
 * back re-checks and shows it again. Deliberately NOT persisted — a
 * permanent dismissal would hide the warning on exactly the later days
 * it still applies to.
 */
export function useCashSessionNotice(): {
  showNoCashSessionNotice: boolean;
  dismissNoCashSessionNotice: () => void;
} {
  const [noSessionOpen, setNoSessionOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // A ref, not a plain `let`: the compiler narrows a closed-over local
  // to its initialiser and the no-unnecessary-condition lint then reads
  // the guard as dead code. A ref's `.current` survives that narrowing.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    void (async () => {
      try {
        const session = await ipc.cashSession.today();
        if (live.current) setNoSessionOpen(session === null);
      } catch {
        // A failed lookup must not imply "no session open" — that would
        // show a false warning on every IPC hiccup. Stay silent instead:
        // the banner is advisory, and the sale screen itself is fine.
        if (live.current) setNoSessionOpen(false);
      }
    })();
    return () => {
      live.current = false;
    };
  }, []);

  return {
    showNoCashSessionNotice: noSessionOpen && !dismissed,
    dismissNoCashSessionNotice: () => {
      setDismissed(true);
    },
  };
}
