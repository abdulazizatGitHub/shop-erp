import { useEffect, useState } from 'react';
import { LoadingState } from '@shop/ui';
import { ipc } from '../lib/ipc.js';
import { SetupWizardPage } from '../pages/setup/SetupWizardPage.js';
import { App } from './App.js';

type RootState = 'loading' | 'wizard' | 'app';

/**
 * Phase 18, go-live preparation — first-run setup wizard. Gates App.tsx
 * entirely: `setup:status` resolves whether a tenant row exists (set by
 * seed(), skipped by main.ts on a fresh install until the wizard's own
 * setup:finish runs it — see main.ts's whenReady() and
 * setup.handler.ts's own header comment). No tenant row means the main
 * app must not render at all, not even behind the wizard — none of its
 * screens have business units/uoms/a default warehouse to work with
 * yet, since those are seeded in the same call that creates the tenant
 * row.
 *
 * main.tsx renders this in place of App.tsx directly; App.tsx itself is
 * unchanged.
 */
export function AppRoot(): React.JSX.Element {
  const [state, setState] = useState<RootState>('loading');

  useEffect(() => {
    let cancelled = false;
    ipc.setup
      .status()
      .then((status) => {
        if (!cancelled) setState(status.tenantExists ? 'app' : 'wizard');
      })
      .catch(() => {
        // Setup status is infrastructure, not a feature — if the check
        // itself fails, fail toward the main app rather than trapping
        // an existing, already-set-up shop behind a wizard it can
        // never pass. A genuinely fresh install with a broken IPC
        // layer would fail obviously and loudly elsewhere anyway.
        if (!cancelled) setState('app');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'loading') return <LoadingState message="Starting…" />;
  if (state === 'wizard') {
    return (
      <SetupWizardPage
        onComplete={() => {
          setState('app');
        }}
      />
    );
  }
  return <App />;
}
