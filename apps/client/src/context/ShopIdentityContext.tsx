import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ShopIdentityDto } from '@shop/contracts';
import { ShopIdentityContext } from '@shop/ui';
import { ipc } from '../lib/ipc.js';

export interface ShopIdentityProviderProps {
  readonly children: ReactNode;
}

/**
 * CL-0b. Fetches setting:getShopIdentity once on mount and feeds
 * @shop/ui's ShopIdentityContext for the whole app lifetime — every
 * document component reads through useShopIdentity() instead of
 * fetching independently. packages/ui owns the context/hook (no IPC
 * dependency there); this provider is the one place that calls IPC.
 */
export function ShopIdentityProvider({ children }: ShopIdentityProviderProps): React.JSX.Element {
  const [identity, setIdentity] = useState<ShopIdentityDto | null>(null);

  useEffect(() => {
    ipc.setting
      .getShopIdentity()
      .then(setIdentity)
      .catch(() => {
        // Document components treat null as "still loading" and render a
        // skeleton indefinitely rather than crash — a failed fetch here
        // must never break the whole app shell.
      });
  }, []);

  return <ShopIdentityContext.Provider value={identity}>{children}</ShopIdentityContext.Provider>;
}
