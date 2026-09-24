import { createContext, useContext } from 'react';

export interface CommissionRefreshContextValue {
  /** Bumped by bump() — SettingsNav's pending-count effect depends on this to refetch. */
  readonly token: number;
  readonly bump: () => void;
}

/**
 * P16-3b — SettingsNav (the pending-count badge) and CommissionApprovalsTab
 * (where approve/reject/reverse actually happen) are siblings under
 * SettingsPage, not parent/child, so a plain callback prop can't connect
 * them. Same shape and same "no-op default so a standalone render never
 * crashes" convention as SettingsDirtyContext.
 */
export const CommissionRefreshContext = createContext<CommissionRefreshContextValue>({
  token: 0,
  bump: () => {
    // no-op default — real value always comes from SettingsPage's provider
  },
});

export function useCommissionRefresh(): CommissionRefreshContextValue {
  return useContext(CommissionRefreshContext);
}
