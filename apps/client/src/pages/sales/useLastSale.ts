import { useState } from 'react';
import type { CartLine } from './CartTable.js';
import type { LastSaleSummary } from './LastSaleModal.js';

/**
 * Holds a read-only snapshot of the most recently completed sale this
 * session, for the "Last sale" topbar button (A-5). Deliberately separate
 * from useSaleFlow's confirmedSale/lastResult, which are cleared on "New
 * sale" — this one persists for the rest of the session. Built entirely
 * from client-side state already available at checkout time; no new IPC.
 */
export function useLastSale(): {
  lastSale: LastSaleSummary | null;
  captureLastSale: (input: {
    docNo: string;
    lines: readonly CartLine[];
    subtotalPaisa: number;
    totalAmountPaisa: number;
    customerName: string | null;
    paymentMode: 'cash' | 'credit';
    paidAmountPaisa: number;
  }) => void;
} {
  const [lastSale, setLastSale] = useState<LastSaleSummary | null>(null);

  function captureLastSale(input: {
    docNo: string;
    lines: readonly CartLine[];
    subtotalPaisa: number;
    totalAmountPaisa: number;
    customerName: string | null;
    paymentMode: 'cash' | 'credit';
    paidAmountPaisa: number;
  }): void {
    setLastSale({ ...input, completedAt: new Date() });
  }

  return { lastSale, captureLastSale };
}
