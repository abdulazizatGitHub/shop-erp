import { createContext, useContext } from 'react';

/**
 * CL-0b. Mirrors @shop/contracts' ShopIdentityDto shape without importing
 * it — packages/ui has no dependency on @shop/contracts or IPC. The app
 * layer (apps/client/src/context/ShopIdentityContext.tsx) owns the actual
 * fetch and feeds this Provider; DocumentHeader/DocumentFooter only ever
 * read through useShopIdentity().
 */
export interface ShopIdentityValue {
  readonly shopName: string;
  readonly shopPhone: string | null;
  readonly shopAddress: string | null;
  readonly shopEmail: string | null;
  readonly invoiceHeaderText: string | null;
  readonly invoiceFooterText: string | null;
  readonly statementFooterText: string | null;
}

/** null means "still loading" — DocumentHeader renders a skeleton for that case. */
export const ShopIdentityContext = createContext<ShopIdentityValue | null>(null);

export function useShopIdentity(): ShopIdentityValue | null {
  return useContext(ShopIdentityContext);
}
