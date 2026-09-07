import { useEffect, useState } from 'react';
import { ipc } from '../lib/ipc.js';
import { NavIcon } from './NavIcon.js';
import { NAV_ITEMS } from './navigation.js';
import type { NavItem, Tab } from './navigation.js';

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
/** Icon-only nav button with a hover/focus tooltip. Shared by the main list and the pinned Settings slot. */
function NavButton({
  item,
  active,
  onSelectTab,
}: {
  readonly item: NavItem;
  readonly active: boolean;
  readonly onSelectTab: (tab: Tab) => void;
}): React.JSX.Element {
  const tooltip = item.shortcutDigit ? `${item.label} · Alt+${item.shortcutDigit}` : item.label;
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      aria-label={tooltip}
      onClick={() => {
        onSelectTab(item.key);
      }}
      className={`group relative flex h-11 w-11 items-center justify-center rounded-md transition-colors ${
        active ? 'bg-brand/20 text-sidebar-active' : 'text-sidebar-text hover:text-white'
      }`}
    >
      <NavIcon tab={item.key} />
      <span
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap
                   rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity
                   group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {tooltip}
      </span>
    </button>
  );
}

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

  // Settings is rendered separately, pinned to the bottom — same NAV_ITEMS
  // data and array order, just two render targets. Not a nav-data change.
  const mainItems = NAV_ITEMS.filter((item) => item.key !== 'settings');
  const settingsItem = NAV_ITEMS.find((item) => item.key === 'settings');

  return (
    <aside className="flex h-screen w-14 shrink-0 flex-col bg-sidebar-bg">
      <div className="flex items-center justify-center border-b border-white/10 py-3">
        <div
          className="flex h-[34px] w-[34px] items-center justify-center rounded-md bg-brand text-sm font-bold text-white"
          title={shopName}
        >
          {shopName.charAt(0).toUpperCase()}
        </div>
      </div>

      <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden py-3">
        {mainItems.map((item) => (
          <NavButton
            key={item.key}
            item={item}
            active={item.key === activeTab}
            onSelectTab={onSelectTab}
          />
        ))}
      </nav>

      {settingsItem && (
        <div className="flex items-center justify-center border-t border-white/10 py-3">
          <NavButton
            item={settingsItem}
            active={settingsItem.key === activeTab}
            onSelectTab={onSelectTab}
          />
        </div>
      )}
    </aside>
  );
}
