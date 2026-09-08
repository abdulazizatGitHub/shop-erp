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

const SIDEBAR_EXPANDED_KEY = 'sidebar-expanded';

function readStoredExpanded(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_EXPANDED_KEY) === 'true';
  } catch {
    // Private browsing / storage blocked — default to collapsed.
    return false;
  }
}

function ChevronIcon({ expanded }: { readonly expanded: boolean }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/**
 * Nav button: icon-only with a hover/focus tooltip when collapsed, or
 * icon + label side by side (tooltip suppressed — the label already says
 * it) when expanded. Shared by the main list and the pinned Settings slot.
 */
function NavButton({
  item,
  active,
  expanded,
  onSelectTab,
}: {
  readonly item: NavItem;
  readonly active: boolean;
  readonly expanded: boolean;
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
      className={`group relative flex h-11 items-center gap-3 rounded-md transition-colors ${
        expanded ? 'w-full justify-start px-3' : 'w-11 justify-center'
      } ${active ? 'bg-brand/20 text-sidebar-active' : 'text-sidebar-text hover:text-white'}`}
    >
      <span className="shrink-0">
        <NavIcon tab={item.key} />
      </span>
      {expanded ? (
        <span className="truncate whitespace-nowrap text-sm">{item.label}</span>
      ) : (
        <span
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap
                     rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity
                     group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {tooltip}
        </span>
      )}
    </button>
  );
}

export function Sidebar({ activeTab, onSelectTab }: SidebarProps): React.JSX.Element {
  const [shopName, setShopName] = useState(DEFAULT_SHOP_NAME);
  const [expanded, setExpanded] = useState(readStoredExpanded);

  useEffect(() => {
    ipc.setting
      .getShopName()
      .then(setShopName)
      .catch(() => {
        // Keep the placeholder — the sidebar must never block on this.
      });
  }, []);

  function toggleExpanded(): void {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(next));
      } catch {
        // Private browsing / storage blocked — the toggle still works for this session.
      }
      return next;
    });
  }

  // Alt+\ toggles the sidebar from anywhere in the app.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.altKey && event.key === '\\') {
        event.preventDefault();
        toggleExpanded();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Settings is rendered separately, pinned to the bottom — same NAV_ITEMS
  // data and array order, just two render targets. Not a nav-data change.
  const mainItems = NAV_ITEMS.filter((item) => item.key !== 'settings');
  const settingsItem = NAV_ITEMS.find((item) => item.key === 'settings');

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col overflow-hidden bg-sidebar-bg transition-[width] duration-200 ease-in-out ${
        expanded ? 'w-[200px]' : 'w-14'
      }`}
    >
      <div
        className={`flex items-center border-b border-white/10 py-3 ${expanded ? 'gap-2 px-3' : 'justify-center'}`}
      >
        <div
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md bg-brand text-sm font-bold text-white"
          title={shopName}
        >
          {shopName.charAt(0).toUpperCase()}
        </div>
        {expanded && <span className="truncate text-sm font-semibold text-white">{shopName}</span>}
      </div>

      <nav
        className={`flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden py-3 ${
          expanded ? 'items-stretch px-2' : 'items-center'
        }`}
      >
        {mainItems.map((item) => (
          <NavButton
            key={item.key}
            item={item}
            active={item.key === activeTab}
            expanded={expanded}
            onSelectTab={onSelectTab}
          />
        ))}
      </nav>

      <div
        className={`flex items-center border-t border-white/10 py-3 ${expanded ? 'px-2' : 'justify-center'}`}
      >
        <button
          type="button"
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-keyshortcuts="Alt+\"
          onClick={toggleExpanded}
          className={`flex h-8 items-center gap-2 rounded-md text-sidebar-text transition-colors hover:text-white ${
            expanded ? 'w-full justify-start px-2 text-sm' : 'w-8 justify-center'
          }`}
        >
          <ChevronIcon expanded={expanded} />
          {expanded && <span>Collapse</span>}
        </button>
      </div>

      {settingsItem && (
        <div
          className={`flex items-center border-t border-white/10 py-3 ${expanded ? 'px-2' : 'justify-center'}`}
        >
          <NavButton
            item={settingsItem}
            active={settingsItem.key === activeTab}
            expanded={expanded}
            onSelectTab={onSelectTab}
          />
        </div>
      )}
    </aside>
  );
}
