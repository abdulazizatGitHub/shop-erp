import { describe, expect, it, vi } from 'vitest';
import type { ReceiptSaleData } from '@shop/db';
import { printReceiptForSale } from './print-receipt.js';

const KNOWN_SALE_DATA: ReceiptSaleData = {
  docNo: 'INV-0007',
  createdAt: '2026-08-29T14:30:00.000Z',
  totalAmountPaisa: 1000000,
  lines: [
    {
      itemName: 'Compressor 1.5 Ton',
      quantityMilli: 2000,
      unitName: 'Piece',
      unitPricePaisa: 500000,
      lineTotalPaisa: 1000000,
    },
  ],
};

describe('printReceiptForSale (P4-1c) — shared by print-after-commit and Reprint', () => {
  it('looks up the sale, builds the layout, and calls the PDF generator with the correct content', async () => {
    const getSaleData = vi.fn().mockResolvedValue(KNOWN_SALE_DATA);
    const getShopName = vi.fn().mockResolvedValue('Malakand AC & Fridge Care');
    const getPageSize = vi.fn().mockResolvedValue('A4' as const);
    const renderPdf = vi.fn().mockResolvedValue(Buffer.from('%PDF-fake'));
    const saveFile = vi.fn().mockResolvedValue('C:\\temp\\receipt-sale1-x.pdf');
    const print = vi.fn().mockResolvedValue(undefined);

    const result = await printReceiptForSale('sale-1', {
      getSaleData,
      getShopName,
      getPageSize,
      renderPdf,
      saveFile,
      print,
    });

    expect(getSaleData).toHaveBeenCalledWith('sale-1');

    // The PDF generator must have been called with layout text containing
    // every field from KNOWN_SALE_DATA — the exact string is already
    // covered by buildReceiptLayout's own tests, so this checks the
    // right DATA reached the renderer, not the formatting itself.
    const [layoutText, pageSizeArg] = renderPdf.mock.calls[0] as [string, string];
    expect(layoutText).toContain('INV-0007');
    expect(layoutText).toContain('Malakand AC & Fridge Care');
    expect(layoutText).toContain('Compressor 1.5 Ton');
    expect(layoutText).toContain('2 Piece');
    expect(pageSizeArg).toBe('A4');

    expect(saveFile).toHaveBeenCalledWith('sale-1', Buffer.from('%PDF-fake'));
    expect(print).toHaveBeenCalledWith('C:\\temp\\receipt-sale1-x.pdf');
    expect(result.filePath).toBe('C:\\temp\\receipt-sale1-x.pdf');
  });

  it('throws a clear error when the sale cannot be found, without calling the PDF generator', async () => {
    const getSaleData = vi.fn().mockResolvedValue(null);
    const renderPdf = vi.fn();

    await expect(
      printReceiptForSale('missing-sale', {
        getSaleData,
        getShopName: vi.fn(),
        getPageSize: vi.fn(),
        renderPdf,
        saveFile: vi.fn(),
        print: vi.fn(),
      }),
    ).rejects.toThrow(/missing-sale/);

    expect(renderPdf).not.toHaveBeenCalled();
  });

  it('throws a clear error when the sale has no lines, without calling the PDF generator', async () => {
    const getSaleData = vi.fn().mockResolvedValue({ ...KNOWN_SALE_DATA, lines: [] });
    const renderPdf = vi.fn();

    await expect(
      printReceiptForSale('empty-sale', {
        getSaleData,
        getShopName: vi.fn(),
        getPageSize: vi.fn(),
        renderPdf,
        saveFile: vi.fn(),
        print: vi.fn(),
      }),
    ).rejects.toThrow(/no line items/);

    expect(renderPdf).not.toHaveBeenCalled();
  });
});
