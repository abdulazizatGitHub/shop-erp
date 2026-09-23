import { createContext, useContext } from 'react';

export interface SettingsDirtyContextValue {
  readonly dirty: boolean;
  readonly setDirty: (dirty: boolean) => void;
}

/**
 * P16-1b — each section reports its own dirty state up so SettingsNav can
 * gate sub-nav clicks with a discard/stay confirm. Scoped to sub-nav
 * clicks only — leaving Settings entirely via the main sidebar is not
 * covered (logged in PROJECT.md backlog).
 */
export const SettingsDirtyContext = createContext<SettingsDirtyContextValue>({
  dirty: false,
  setDirty: () => {
    // no-op default — real value always comes from SettingsPage's provider
  },
});

export function useSettingsDirty(): SettingsDirtyContextValue {
  return useContext(SettingsDirtyContext);
}
