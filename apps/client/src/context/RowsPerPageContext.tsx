import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { RowsPerPage } from '@shop/contracts';
import { ipc } from '../lib/ipc.js';

// P17-3 (docs/phases/PHASE_17.md §2.5, S17-REP-1, Q17-2). Default 10
// matches every existing report table's own hardcoded constant — also
// what a fresh DB's getRowsPerPage() falls back to, so a provider that
// hasn't finished its one IPC read yet renders identically to what the
// setting will resolve to anyway.
const DEFAULT_ROWS_PER_PAGE: RowsPerPage = 10;

interface RowsPerPageContextValue {
  readonly rowsPerPage: RowsPerPage;
  readonly setRowsPerPage: (value: RowsPerPage) => void;
}

const RowsPerPageContext = createContext<RowsPerPageContextValue>({
  rowsPerPage: DEFAULT_ROWS_PER_PAGE,
  setRowsPerPage: () => {
    // No-op outside a provider — every real mount goes through
    // RowsPerPageProvider (wired in App.tsx), same fallback shape as
    // ShopIdentityContext's null default for an un-provided consumer.
  },
});

/**
 * P17-3. The one shared hook every report/list table (9 report tabs +
 * JobsPage.tsx + CustomerLedgerTable.tsx) reads instead of its own local
 * `const ROWS_PER_PAGE = ...`. One IPC read for the whole app
 * (RowsPerPageProvider, below) — not 11 separate per-mount fetches —
 * and every subscriber re-renders the instant the Settings page changes
 * it, no reload needed (A17-4).
 */
export function useRowsPerPage(): RowsPerPage {
  return useContext(RowsPerPageContext).rowsPerPage;
}

/** Used only by ReportsDisplaySettingsSection.tsx, to push a saved change out live. */
export function useSetRowsPerPage(): (value: RowsPerPage) => void {
  return useContext(RowsPerPageContext).setRowsPerPage;
}

export interface RowsPerPageProviderProps {
  readonly children: ReactNode;
}

export function RowsPerPageProvider({ children }: RowsPerPageProviderProps): React.JSX.Element {
  const [rowsPerPage, setRowsPerPage] = useState<RowsPerPage>(DEFAULT_ROWS_PER_PAGE);

  useEffect(() => {
    ipc.setting
      .getRowsPerPage()
      .then(setRowsPerPage)
      .catch(() => {
        // A failed read is never worth breaking the whole app shell over —
        // every table just keeps the same default a fresh DB would give.
      });
  }, []);

  return (
    <RowsPerPageContext.Provider value={{ rowsPerPage, setRowsPerPage }}>
      {children}
    </RowsPerPageContext.Provider>
  );
}
