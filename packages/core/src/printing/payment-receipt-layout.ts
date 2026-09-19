import type { ShopIdentity } from '../shop/shop-identity.js';

/**
 * CL-7B. Pure, pdfkit-free structured content for the payment receipt
 * PDF (CL-7C draws from this). Unlike buildReceiptLayout/buildInvoiceLayout
 * (single joined string), this returns sections — the pdfkit renderer
 * needs the amount to stand out visually, which a flat string can't express.
 *
 * Input shape mirrors packages/db's PaymentReceiptData structurally —
 * packages/core has no dependency on packages/db (dependency direction is
 * one-way; db depends on core, never the reverse), so this is a local,
 * duck-typed input interface rather than an import.
 */
export interface PaymentReceiptData {
  readonly docNo: string;
  readonly paymentDate: string;
  readonly amountPaisa: number;
  readonly method: string;
  readonly referenceNo: string | null;
  readonly customerName: string;
  readonly customerCode: string;
  readonly customerPhone: string | null;
  readonly shopIdentity: ShopIdentity;
  readonly previousBalancePaisa: number;
  readonly remainingBalancePaisa: number;
}
export interface PaymentReceiptLayoutData {
  readonly shopSection: {
    readonly name: string;
    readonly phone: string | null;
    readonly address: string | null;
  };
  readonly documentSection: {
    readonly receiptNo: string;
    readonly date: string;
    readonly method: string;
    readonly referenceNo: string | null;
  };
  readonly customerSection: {
    readonly name: string;
    readonly code: string;
    readonly phone: string | null;
  };
  readonly paymentSection: {
    readonly amountPaisa: number;
    readonly previousBalancePaisa: number;
    readonly remainingBalancePaisa: number;
  };
  readonly footerText: string | null;
}

export function buildPaymentReceiptLayout(data: PaymentReceiptData): PaymentReceiptLayoutData {
  return {
    shopSection: {
      name: data.shopIdentity.shopName,
      phone: data.shopIdentity.shopPhone,
      address: data.shopIdentity.shopAddress,
    },
    documentSection: {
      receiptNo: data.docNo,
      date: data.paymentDate,
      method: data.method,
      referenceNo: data.referenceNo,
    },
    customerSection: {
      name: data.customerName,
      code: data.customerCode,
      phone: data.customerPhone,
    },
    paymentSection: {
      amountPaisa: data.amountPaisa,
      previousBalancePaisa: data.previousBalancePaisa,
      remainingBalancePaisa: data.remainingBalancePaisa,
    },
    footerText: data.shopIdentity.invoiceFooterText,
  };
}
