import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Badge, ConfirmDialog } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { SETTINGS_NAV } from './settingsNav.config.js';
import { useCommissionRefresh } from './CommissionRefreshContext.js';
import { useSettingsDirty } from './SettingsDirtyContext.js';

/**
 * P16-1b — grouped left sub-nav. Intercepts a click only when the current
 * section is dirty (SettingsDirtyContext): shows a discard/stay confirm
 * instead of navigating immediately. Scoped to these clicks only — see
 * PROJECT.md backlog for what this does not cover.
 *
 * P16-3b — the Commission Approvals item's badge is fetched live here
 * (listPendingClaims().length), not from settingsNav.config.ts's static
 * `badge` field (always undefined) — a nav-wide concern, not something
 * CommissionApprovalsTab itself should own, since the badge must show
 * even while that tab isn't mounted. Refetches whenever
 * CommissionRefreshContext's token changes — bumped by
 * CommissionApprovalsTab after any approve/reject/reverse, so the badge
 * updates immediately instead of waiting for a full remount.
 */
export function SettingsNav(): React.JSX.Element {
  const { dirty, setDirty } = useSettingsDirty();
  const { token: commissionRefreshToken } = useCommissionRefresh();
  const navigate = useNavigate();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [pendingClaimCount, setPendingClaimCount] = useState<number | null>(null);

  useEffect(() => {
    ipc.commission
      .listPending()
      .then((claims) => {
        setPendingClaimCount(claims.length);
      })
      .catch(() => {
        setPendingClaimCount(null); // silent — a nav badge is never worth blocking or erroring the whole shell over
      });
  }, [commissionRefreshToken]);

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
              const badgeCount = item.key === 'commission-approvals' ? pendingClaimCount : null;
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
                  <span className="flex flex-1 flex-col">
                    <span className="flex items-center gap-2 font-medium">
                      {item.title}
                      {badgeCount !== null && badgeCount > 0 && (
                        <Badge tone="warning">{badgeCount}</Badge>
                      )}
                    </span>
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
