import { describe, expect, it, vi } from 'vitest';
import type { PurchasePrintData } from '@shop/db';
import { printPurchaseOrderSafely } from './print-purchase-safely.js';

const KNOWN_PURCHASE_DATA: PurchasePrintData = {
  docNo: 'PUR-0010',
  purchaseDate: '2026-08-31',
  paymentMode: 'cash',
  supplierName: 'Test Gas & Compressor Supplier',
  supplierShopName: null,
  supplierPhone: '03001234567',
  supplierCityArea: null,
  shopName: 'Al-Falah Traders',
  lines: [
    {
      itemName: 'Compressor 1.5 Ton',
      quantityMilli: 2000,
      unitName: 'Piece',
      unitCostPaisa: 500_000,
      lineTotalPaisa: 1_000_000,
    },
  ],
  totalAmountPaisa: 1_000_000,
};

describe('printPurchaseOrderSafely — same error isolation as printInvoiceSafely, never throws', () => {
  it('returns filePath, printError null, on success', async () => {
    const deps = {
      getPurchasePrintData: vi.fn().mockResolvedValue(KNOWN_PURCHASE_DATA),
      renderPdf: vi.fn().mockResolvedValue(undefined),
      computeOutputPath: vi.fn().mockReturnValue('C:\\temp\\purchase-order-pur1-x.pdf'),
      print: vi.fn().mockResolvedValue(undefined),
    };

    const result = await printPurchaseOrderSafely('pur-1', deps);

    expect(result).toEqual({ filePath: 'C:\\temp\\purchase-order-pur1-x.pdf', printError: null });
  });

  it('returns printError instead of throwing when the print step fails', async () => {
    const deps = {
      getPurchasePrintData: vi.fn().mockResolvedValue(KNOWN_PURCHASE_DATA),
      renderPdf: vi.fn().mockResolvedValue(undefined),
      computeOutputPath: vi.fn().mockReturnValue('C:\\temp\\purchase-order-pur1-x.pdf'),
      print: vi.fn().mockRejectedValue(new Error('Printer offline')),
    };

    const result = await printPurchaseOrderSafely('pur-1', deps);

    expect(result.filePath).toBeNull();
    expect(result.printError).toBe('Printer offline');
  });

  it('returns printError instead of throwing when the purchase cannot be found', async () => {
    const deps = {
      getPurchasePrintData: vi.fn().mockResolvedValue(null),
      renderPdf: vi.fn(),
      computeOutputPath: vi.fn(),
      print: vi.fn(),
    };

    const result = await printPurchaseOrderSafely('missing-purchase', deps);

    expect(result.filePath).toBeNull();
    expect(result.printError).toContain('missing-purchase');
    expect(deps.renderPdf).not.toHaveBeenCalled();
  });
});
