/**
 * Repository interface (port) — defined here in core, implemented in db.
 * Dependency inversion: core never imports db. See docs/ARCHITECTURE.md
 * section 2, "Why the domain layer is pure."
 *
 * P3-3 scope: customer payments only. direction is always 'in' — never
 * a caller input, set unconditionally by the repository.
 */
export type PaymentMethod = 'cash' | 'bank' | 'easypaisa' | 'jazzcash' | 'cheque';
export type PaymentDirection = 'in' | 'out';

export interface NewPaymentInput {
  readonly partyId: string;
  readonly amountPaisa: number;
  readonly method: PaymentMethod;
  readonly paymentDate: string;
  readonly referenceNo: string | null;
  readonly notes: string | null;
}

export interface PaymentRecord {
  readonly id: string;
  readonly docNo: string;
  readonly partyId: string;
  readonly amountPaisa: number;
  readonly direction: PaymentDirection;
  readonly method: PaymentMethod;
  readonly paymentDate: string;
}

export interface PaymentRepositoryPort {
  /**
   * Inserts payment (direction='in', amount positive) + party_ledger
   * (entry_type='payment_received', amount negative — CF-2's sign
   * convention) + audit_log + sync_outbox in one transaction. Write
   * path — must be wrapped in withRetry (PROJECT.md BUG-15). No credit
   * check: a customer may overpay, taking their balance negative.
   */
  createPayment(input: NewPaymentInput): Promise<PaymentRecord>;
}
