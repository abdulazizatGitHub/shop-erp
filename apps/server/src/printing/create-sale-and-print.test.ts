import { describe, expect, it, vi } from 'vitest';
import type { SaleResult } from '@shop/contracts';
import { createSaleAndPrintReceipt } from './create-sale-and-print.js';

const KNOWN_SALE_RESULT: SaleResult = {
  id: 'sale-123',
  docNo: 'INV-0009',
  totalAmountPaisa: 500000,
  warnings: { creditLimitExceeded: false, stockBelowZero: false, unitCostMissing: false },
};

describe('createSaleAndPrintReceipt (P4-1c) — print-after-commit, never rolls back or hides the sale', () => {
  it('returns the sale result unchanged, printError null, when printing succeeds', async () => {
    const createSale = vi.fn().mockResolvedValue(KNOWN_SALE_RESULT);
    const printReceipt = vi.fn().mockResolvedValue({ filePath: 'C:\\temp\\receipt-sale-123.pdf' });

    const result = await createSaleAndPrintReceipt(createSale, printReceipt);

    expect(result).toEqual({ ...KNOWN_SALE_RESULT, printError: null });
    expect(printReceipt).toHaveBeenCalledWith('sale-123');
  });

  it('still returns the full sale result when printing fails — the sale is never lost or blocked', async () => {
    const createSale = vi.fn().mockResolvedValue(KNOWN_SALE_RESULT);
    const printReceipt = vi.fn().mockRejectedValue(new Error('Printer offline'));

    const result = await createSaleAndPrintReceipt(createSale, printReceipt);

    // The sale itself — id, docNo, totalAmountPaisa, warnings — must be
    // intact and returned exactly as createSale produced it.
    expect(result.id).toBe(KNOWN_SALE_RESULT.id);
    expect(result.docNo).toBe(KNOWN_SALE_RESULT.docNo);
    expect(result.totalAmountPaisa).toBe(KNOWN_SALE_RESULT.totalAmountPaisa);
    expect(result.warnings).toEqual(KNOWN_SALE_RESULT.warnings);
    // The print failure is surfaced separately, not thrown, not silent.
    expect(result.printError).toBe('Printer offline');
  });

  it('propagates a createSale failure as a real rejection — that IS a blocking error', async () => {
    const createSale = vi.fn().mockRejectedValue(new Error('Insufficient stock'));
    const printReceipt = vi.fn();

    await expect(createSaleAndPrintReceipt(createSale, printReceipt)).rejects.toThrow(
      'Insufficient stock',
    );
    expect(printReceipt).not.toHaveBeenCalled();
  });
});
