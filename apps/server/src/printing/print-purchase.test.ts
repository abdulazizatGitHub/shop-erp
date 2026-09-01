import { describe, expect, it, vi } from 'vitest';
import type { PurchasePrintData } from '@shop/db';
import { printPurchaseOrder } from './print-purchase.js';

const KNOWN_PURCHASE_DATA: PurchasePrintData = {
  docNo: 'PUR-0010',
  purchaseDate: '2026-08-31',
  paymentMode: 'credit',
  supplierName: 'Test Gas & Compressor Supplier',
  supplierShopName: 'Metro Refrigeration',
  supplierPhone: '03001234567',
  supplierCityArea: 'Malakand',
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

describe('printPurchaseOrder — always A4, writes directly to a computed path', () => {
  it('looks up the print data, renders to the computed path, and prints it', async () => {
    const getPurchasePrintData = vi.fn().mockResolvedValue(KNOWN_PURCHASE_DATA);
    const renderPdf = vi.fn().mockResolvedValue(undefined);
    const computeOutputPath = vi.fn().mockReturnValue('C:\\temp\\purchase-order-pur1-x.pdf');
    const print = vi.fn().mockResolvedValue(undefined);

    const result = await printPurchaseOrder('pur-1', {
      getPurchasePrintData,
      renderPdf,
      computeOutputPath,
      print,
    });

    expect(getPurchasePrintData).toHaveBeenCalledWith('pur-1');
    expect(computeOutputPath).toHaveBeenCalledWith('pur-1');
    expect(renderPdf).toHaveBeenCalledWith(
      KNOWN_PURCHASE_DATA,
      'C:\\temp\\purchase-order-pur1-x.pdf',
    );
    expect(print).toHaveBeenCalledWith('C:\\temp\\purchase-order-pur1-x.pdf');
    expect(result.filePath).toBe('C:\\temp\\purchase-order-pur1-x.pdf');
  });

  it('throws a clear error when the purchase cannot be found, without calling the PDF generator', async () => {
    const getPurchasePrintData = vi.fn().mockResolvedValue(null);
    const renderPdf = vi.fn();

    await expect(
      printPurchaseOrder('missing-purchase', {
        getPurchasePrintData,
        renderPdf,
        computeOutputPath: vi.fn(),
        print: vi.fn(),
      }),
    ).rejects.toThrow(/missing-purchase/);

    expect(renderPdf).not.toHaveBeenCalled();
  });
});
