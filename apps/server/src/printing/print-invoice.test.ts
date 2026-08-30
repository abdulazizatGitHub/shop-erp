import { describe, expect, it, vi } from 'vitest';
import type { InvoiceData } from '@shop/db';
import { printInvoiceForSale } from './print-invoice.js';

const KNOWN_INVOICE_DATA: InvoiceData = {
  docNo: 'INV-0010',
  saleDate: '2026-08-30',
  customerName: 'Malik Traders',
  customerPhone: '0300-1234567',
  customerAddress: 'Main Bazaar, Malakand',
  lines: [
    {
      itemName: 'Compressor 1.5 Ton',
      quantityMilli: 2000,
      unitName: 'Piece',
      unitPricePaisa: 500000,
      lineTotalPaisa: 1000000,
    },
  ],
  totalAmountPaisa: 1000000,
  paidAmountPaisa: 500000,
  balanceDuePaisa: 500000,
};

describe('printInvoiceForSale (P4-2 wiring) — always A4, no page-size parameter', () => {
  it('looks up the invoice data, builds the layout, and calls the PDF generator with the correct content', async () => {
    const getInvoiceData = vi.fn().mockResolvedValue(KNOWN_INVOICE_DATA);
    const renderPdf = vi.fn().mockResolvedValue(Buffer.from('%PDF-fake'));
    const saveFile = vi.fn().mockResolvedValue('C:\\temp\\invoice-sale1-x.pdf');
    const print = vi.fn().mockResolvedValue(undefined);

    const result = await printInvoiceForSale('sale-1', {
      getInvoiceData,
      renderPdf,
      saveFile,
      print,
    });

    expect(getInvoiceData).toHaveBeenCalledWith('sale-1');

    // renderPdf for the invoice takes only layoutText — no page-size
    // argument, unlike the receipt's renderPdf(layoutText, pageSize).
    const call = renderPdf.mock.calls[0] as [string];
    expect(call).toHaveLength(1);
    const layoutText = call[0];
    expect(layoutText).toContain('INV-0010');
    expect(layoutText).toContain('Malik Traders');
    expect(layoutText).toContain('Compressor 1.5 Ton');
    expect(layoutText).toContain('Balance Due');

    expect(saveFile).toHaveBeenCalledWith('sale-1', Buffer.from('%PDF-fake'));
    expect(print).toHaveBeenCalledWith('C:\\temp\\invoice-sale1-x.pdf');
    expect(result.filePath).toBe('C:\\temp\\invoice-sale1-x.pdf');
  });

  it('throws a clear error when the sale cannot be found, without calling the PDF generator', async () => {
    const getInvoiceData = vi.fn().mockResolvedValue(null);
    const renderPdf = vi.fn();

    await expect(
      printInvoiceForSale('missing-sale', {
        getInvoiceData,
        renderPdf,
        saveFile: vi.fn(),
        print: vi.fn(),
      }),
    ).rejects.toThrow(/missing-sale/);

    expect(renderPdf).not.toHaveBeenCalled();
  });

  it('throws a clear error when the sale has no lines, without calling the PDF generator', async () => {
    const getInvoiceData = vi.fn().mockResolvedValue({ ...KNOWN_INVOICE_DATA, lines: [] });
    const renderPdf = vi.fn();

    await expect(
      printInvoiceForSale('empty-sale', {
        getInvoiceData,
        renderPdf,
        saveFile: vi.fn(),
        print: vi.fn(),
      }),
    ).rejects.toThrow(/no line items/);

    expect(renderPdf).not.toHaveBeenCalled();
  });
});
