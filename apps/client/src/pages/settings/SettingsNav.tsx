import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '@shop/ui';
import { SETTINGS_NAV } from './settingsNav.config.js';
import { useSettingsDirty } from './SettingsDirtyContext.js';

/**
 * P16-1b — grouped left sub-nav. Intercepts a click only when the current
 * section is dirty (SettingsDirtyContext): shows a discard/stay confirm
 * instead of navigating immediately. Scoped to these clicks only — see
 * PROJECT.md backlog for what this does not cover.
 */
export function SettingsNav(): React.JSX.Element {
  const { dirty, setDirty } = useSettingsDirty();
  const navigate = useNavigate();
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  function handleClick(path: string, event: React.MouseEvent): void {
    if (!dirty) return;
    event.preventDefault();
    setPendingPath(path);
  }

  function confirmDiscard(): void {
    const path = pendingPath;
    setPendingPath(null);
    setDirty(false);
    if (path) navigate(path);
  }

  function cancelDiscard(): void {
    setPendingPath(null);
  }

  return (
    <nav className="w-64 shrink-0 border-r border-line px-3 py-5">
      {SETTINGS_NAV.map((group) => (
        <div key={group.label} className="mb-5">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            {group.label}
          </p>
          <div className="flex flex-col gap-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.key}
                  to={item.path}
                  onClick={(event) => {
                    handleClick(item.path, event);
                  }}
                  className={({ isActive }) =>
                    `flex items-start gap-3 rounded-md px-3 py-2 text-sm ${
                      isActive ? 'bg-brand-subtle text-brand' : 'text-ink hover:bg-surface-sunken'
                    }`
                  }
                >
                  <Icon size={18} strokeWidth={1.5} className="mt-0.5 shrink-0" />
                  <span className="flex flex-col">
                    <span className="font-medium">{item.title}</span>
                    <span className="text-xs text-ink-muted">{item.hint}</span>
                  </span>
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
      <ConfirmDialog
        open={pendingPath !== null}
        title="Discard unsaved changes?"
        confirmLabel="Discard"
        cancelLabel="Stay"
        confirmVariant="warning"
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      >
        This section has unsaved changes. Discard them and continue?
      </ConfirmDialog>
    </nav>
  );
}
