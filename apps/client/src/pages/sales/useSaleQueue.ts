import { useState } from 'react';
import type { CustomerDto } from '@shop/contracts';
import type { CartLine } from './CartTable.js';
import type { PaymentMode } from './useSaleFlow.js';

const MAX_QUEUE_SIZE = 5;

export interface QueuedSale {
  readonly id: string;
  readonly cart: readonly CartLine[];
  readonly customer: CustomerDto | null;
  readonly paymentMode: PaymentMode;
  readonly amountPaidRupees: string;
  readonly heldAt: Date;
}

/**
 * Up to 5 paused sales-in-progress (A-4) — in-memory only, lost on app
 * restart by design (per spec). Holds/resumes the full state a sale needs
 * to resume exactly where it left off: cart, customer, payment mode, and
 * whatever's currently typed into "amount received".
 */
export function useSaleQueue(): {
  queue: readonly QueuedSale[];
  isFull: boolean;
  hold: (entry: {
    cart: readonly CartLine[];
    customer: CustomerDto | null;
    paymentMode: PaymentMode;
    amountPaidRupees: string;
  }) => boolean;
  resume: (id: string) => QueuedSale | null;
} {
  const [queue, setQueue] = useState<readonly QueuedSale[]>([]);

  function hold(entry: {
    cart: readonly CartLine[];
    customer: CustomerDto | null;
    paymentMode: PaymentMode;
    amountPaidRupees: string;
  }): boolean {
    if (queue.length >= MAX_QUEUE_SIZE) return false;
    setQueue((prev) => [...prev, { ...entry, id: crypto.randomUUID(), heldAt: new Date() }]);
    return true;
  }

  function resume(id: string): QueuedSale | null {
    const entry = queue.find((q) => q.id === id) ?? null;
    if (entry) setQueue((prev) => prev.filter((q) => q.id !== id));
    return entry;
  }

  return { queue, isFull: queue.length >= MAX_QUEUE_SIZE, hold, resume };
}
