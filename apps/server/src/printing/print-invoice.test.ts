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
      lineKind: 'part',
      businessUnitName: null,
    },
  ],
  totalAmountPaisa: 1000000,
  paidAmountPaisa: 500000,
  balanceDuePaisa: 500000,
  jobDocNo: null,
  reportedFault: null,
  technicianName: null,
};

describe('printInvoiceForSale (P4-2 wiring, rewired P17-5) — reads receiptPaperSize, no longer hardcoded to A4', () => {
  it('looks up the invoice data, builds the layout, and calls the PDF generator with the correct content and page size', async () => {
    const getInvoiceData = vi.fn().mockResolvedValue(KNOWN_INVOICE_DATA);
    const getPageSize = vi.fn().mockResolvedValue('A5' as const);
    const renderPdf = vi.fn().mockResolvedValue(Buffer.from('%PDF-fake'));
    const saveFile = vi.fn().mockResolvedValue('C:\\temp\\invoice-sale1-x.pdf');
    const print = vi.fn().mockResolvedValue(undefined);

    const result = await printInvoiceForSale('sale-1', {
      getInvoiceData,
      getPageSize,
      renderPdf,
      saveFile,
      print,
    });

    expect(getInvoiceData).toHaveBeenCalledWith('sale-1');

    // renderPdf for the invoice now takes layoutText AND the page-size
    // argument read from getPageSize — S17-PRINT-2a's whole point.
    const call = renderPdf.mock.calls[0] as [string, string];
    expect(call).toHaveLength(2);
    const [layoutText, pageSizeArg] = call;
    expect(layoutText).toContain('INV-0010');
    expect(layoutText).toContain('Malik Traders');
    expect(layoutText).toContain('Compressor 1.5 Ton');
    expect(layoutText).toContain('Balance Due');
    expect(pageSizeArg).toBe('A5');

    expect(saveFile).toHaveBeenCalledWith('sale-1', Buffer.from('%PDF-fake'));
    expect(print).toHaveBeenCalledWith('C:\\temp\\invoice-sale1-x.pdf');
    expect(result.filePath).toBe('C:\\temp\\invoice-sale1-x.pdf');
  });

  it('passes A4 through unchanged when that is the configured size (default, visually unchanged from before P17-5)', async () => {
    const getPageSize = vi.fn().mockResolvedValue('A4' as const);
    const renderPdf = vi.fn().mockResolvedValue(Buffer.from('%PDF-fake'));

    await printInvoiceForSale('sale-1', {
      getInvoiceData: vi.fn().mockResolvedValue(KNOWN_INVOICE_DATA),
      getPageSize,
      renderPdf,
      saveFile: vi.fn().mockResolvedValue('x.pdf'),
      print: vi.fn().mockResolvedValue(undefined),
    });

    const [, pageSizeArg] = renderPdf.mock.calls[0] as [string, string];
    expect(pageSizeArg).toBe('A4');
  });

  it('throws a clear error when the sale cannot be found, without calling the PDF generator', async () => {
    const getInvoiceData = vi.fn().mockResolvedValue(null);
    const renderPdf = vi.fn();

    await expect(
      printInvoiceForSale('missing-sale', {
        getInvoiceData,
        getPageSize: vi.fn(),
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
        getPageSize: vi.fn(),
        renderPdf,
        saveFile: vi.fn(),
        print: vi.fn(),
      }),
    ).rejects.toThrow(/no line items/);

    expect(renderPdf).not.toHaveBeenCalled();
  });
});
