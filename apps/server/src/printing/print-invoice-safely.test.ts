import { describe, expect, it, vi } from 'vitest';
import type { InvoiceData } from '@shop/db';
import { printInvoiceSafely } from './print-invoice-safely.js';

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

describe('printInvoiceSafely (P4-2 wiring) — same error isolation as the receipt, never throws', () => {
  it('returns filePath, printError null, on success', async () => {
    const deps = {
      getInvoiceData: vi.fn().mockResolvedValue(KNOWN_INVOICE_DATA),
      renderPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-fake')),
      saveFile: vi.fn().mockResolvedValue('C:\\temp\\invoice-sale1-x.pdf'),
      print: vi.fn().mockResolvedValue(undefined),
    };

    const result = await printInvoiceSafely('sale-1', deps);

    expect(result).toEqual({ filePath: 'C:\\temp\\invoice-sale1-x.pdf', printError: null });
  });

  it('returns printError instead of throwing when the print step fails', async () => {
    const deps = {
      getInvoiceData: vi.fn().mockResolvedValue(KNOWN_INVOICE_DATA),
      renderPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-fake')),
      saveFile: vi.fn().mockResolvedValue('C:\\temp\\invoice-sale1-x.pdf'),
      print: vi.fn().mockRejectedValue(new Error('Printer offline')),
    };

    const result = await printInvoiceSafely('sale-1', deps);

    expect(result.filePath).toBeNull();
    expect(result.printError).toBe('Printer offline');
  });

  it('returns printError instead of throwing when the sale/invoice data cannot be found', async () => {
    const deps = {
      getInvoiceData: vi.fn().mockResolvedValue(null),
      renderPdf: vi.fn(),
      saveFile: vi.fn(),
      print: vi.fn(),
    };

    const result = await printInvoiceSafely('missing-sale', deps);

    expect(result.filePath).toBeNull();
    expect(result.printError).toContain('missing-sale');
    expect(deps.renderPdf).not.toHaveBeenCalled();
  });
});
