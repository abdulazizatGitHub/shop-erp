import { useState } from 'react';
import { NavIcon } from './NavIcon.js';
import type { NavItem, ReportsGroup, Tab } from './navigation.js';

const SUB_ITEMS: readonly { readonly key: ReportsGroup; readonly label: string }[] = [
  { key: 'daily', label: 'Daily Reports' },
  { key: 'accounts', label: 'Accounts' },
];

/**
 * Disclosure chevron (▶ closed / ▼ open) — same stroke/svg convention as
 * Sidebar.tsx's own ChevronIcon, but a 90° rotation (not 180°): that one
 * points left/right to indicate a collapse/expand *direction*, this one
 * points right/down to indicate an accordion's open/closed *state*, so the
 * two aren't interchangeable despite sharing a shape.
 */
function DisclosureChevron({ open }: { readonly open: boolean }): React.JSX.Element {
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
      className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export interface ReportsNavItemProps {
  readonly item: NavItem;
  /** Whether the app's main tab is currently 'reports'. */
  readonly active: boolean;
  /** Whole-sidebar width state (56px icon-only vs 200px with labels) — not this item's own disclosure. */
  readonly sidebarExpanded: boolean;
  /** This item's own disclosure state (sub-items visible), only meaningful when sidebarExpanded. */
  readonly groupExpanded: boolean;
  readonly onToggleGroupExpanded: () => void;
  readonly activeReportsGroup: ReportsGroup;
  readonly onSelectTab: (tab: Tab) => void;
  readonly onSelectReportsGroup: (group: ReportsGroup) => void;
}

/**
 * P11-1 — the only sidebar item with sub-items, so this is a dedicated
 * component rather than a generic "sub-items" feature on NavButton.
 * Expanded sidebar (200px): a disclosure row (icon + label + chevron)
 * toggles a two-item list below it. Collapsed sidebar (56px): icon-only,
 * with a hover/focus flyout offering both sub-items directly — there's no
 * room for a separate disclosure step at that width.
 */
export function ReportsNavItem({
  item,
  active,
  sidebarExpanded,
  groupExpanded,
  onToggleGroupExpanded,
  activeReportsGroup,
  onSelectTab,
  onSelectReportsGroup,
}: ReportsNavItemProps): React.JSX.Element {
  // Collapsed (56px) mode's flyout is JS-driven (not pure CSS group-hover):
  // that keeps the sub-item buttons genuinely absent from the DOM until
  // hovered/focused, rather than present-but-CSS-hidden — matching the
  // requirement that sub-item labels aren't shown in collapsed mode, and
  // making that requirement something a render test can actually assert
  // (jsdom doesn't apply real stylesheets, so a CSS-only `hidden` class
  // can't be verified by querying the DOM).
  const [flyoutOpen, setFlyoutOpen] = useState(false);

  function selectGroup(group: ReportsGroup): void {
    onSelectReportsGroup(group);
  }

  if (!sidebarExpanded) {
    return (
      <div
        className="relative"
        onMouseEnter={() => {
          setFlyoutOpen(true);
        }}
        onMouseLeave={() => {
          setFlyoutOpen(false);
        }}
        onFocus={() => {
          setFlyoutOpen(true);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setFlyoutOpen(false);
          }
        }}
      >
        <button
          type="button"
          aria-current={active ? 'page' : undefined}
          aria-label={item.label}
          onClick={() => {
            onSelectTab(item.key);
          }}
          className={`flex h-11 w-11 items-center justify-center rounded-md transition-colors ${
            active ? 'bg-brand/20 text-sidebar-active' : 'text-sidebar-text hover:text-white'
          }`}
        >
          <NavIcon tab={item.key} />
        </button>
        {flyoutOpen && (
          <div className="absolute left-full top-0 z-50 ml-2 flex min-w-[140px] flex-col overflow-hidden rounded bg-gray-900 py-1 text-white shadow-lg">
            {SUB_ITEMS.map((sub) => (
              <button
                key={sub.key}
                type="button"
                aria-current={active && activeReportsGroup === sub.key ? 'page' : undefined}
                onClick={() => {
                  selectGroup(sub.key);
                }}
                className={`whitespace-nowrap px-3 py-2 text-left text-xs hover:bg-white/10 ${
                  active && activeReportsGroup === sub.key ? 'text-sidebar-active' : ''
                }`}
              >
                {sub.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col">
      <button
        type="button"
        aria-expanded={groupExpanded}
        onClick={onToggleGroupExpanded}
        className={`flex h-11 w-full items-center justify-between gap-3 rounded-md px-3 transition-colors ${
          active ? 'bg-brand/20 text-sidebar-active' : 'text-sidebar-text hover:text-white'
        }`}
      >
        <span className="flex items-center gap-3">
          <span className="shrink-0">
            <NavIcon tab={item.key} />
          </span>
          <span className="truncate whitespace-nowrap text-sm">{item.label}</span>
        </span>
        <DisclosureChevron open={groupExpanded} />
      </button>

      {groupExpanded && (
        <div className="ml-6 mt-1 flex flex-col gap-0.5 border-l border-white/10 pl-3">
          {SUB_ITEMS.map((sub) => {
            const subActive = active && activeReportsGroup === sub.key;
            return (
              <button
                key={sub.key}
                type="button"
                aria-current={subActive ? 'page' : undefined}
                onClick={() => {
                  selectGroup(sub.key);
                }}
                className={`rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                  subActive ? 'text-sidebar-active' : 'text-sidebar-text hover:text-white'
                }`}
              >
                {sub.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
