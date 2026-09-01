import { useEffect, useState } from 'react';
import { ipc } from '../lib/ipc.js';
import { APP_VERSION } from '../version.js';
import { NavIcon } from './NavIcon.js';
import { NAV_ITEMS } from './navigation.js';
import type { Tab } from './navigation.js';

export interface SidebarProps {
  readonly activeTab: Tab;
  readonly onSelectTab: (tab: Tab) => void;
}

// Matches the `setting` table's own default (packages/db/src/repositories/setting.repository.ts)
// so the sidebar never shows a different placeholder than the Settings screen does.
const DEFAULT_SHOP_NAME = 'Shop ERP';

/**
 * Fixed, non-collapsing left navigation (collapsible is a Phase 8
 * enhancement — logged in PROJECT.md, not built here). Never scrolls;
 * only the main content area does.
 */
export function Sidebar({ activeTab, onSelectTab }: SidebarProps): React.JSX.Element {
  const [shopName, setShopName] = useState(DEFAULT_SHOP_NAME);

  useEffect(() => {
    ipc.setting
      .getShopName()
      .then(setShopName)
      .catch(() => {
        // Keep the placeholder — the sidebar must never block on this.
      });
  }, []);

  return (
    <aside className="flex h-screen w-52 shrink-0 flex-col border-r border-line bg-surface">
      <div className="border-b border-line px-4 py-4">
        <p className="truncate text-base font-semibold text-ink" title={shopName}>
          {shopName}
        </p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const active = item.key === activeTab;
          return (
            <button
              key={item.key}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                onSelectTab(item.key);
              }}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                active ? 'bg-brand text-white' : 'text-ink hover:bg-surface-sunken'
              }`}
            >
              <NavIcon tab={item.key} />
              <span className="flex-1 text-left">{item.label}</span>
              <span className={`text-xs ${active ? 'text-white/70' : 'text-ink-faint'}`}>
                Alt+{item.shortcutDigit}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-line px-4 py-3">
        <p className="text-xs text-ink-faint">v{APP_VERSION}</p>
      </div>
    </aside>
  );
}
