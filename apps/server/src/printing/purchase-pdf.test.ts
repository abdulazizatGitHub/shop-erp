import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PurchasePrintData } from '@shop/db';
import { renderPurchasePdf } from './purchase-pdf.js';

const SAMPLE_DATA: PurchasePrintData = {
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

let workDir: string;
let outputPath: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'shop-erp-purchase-pdf-test-'));
  outputPath = path.join(workDir, 'purchase-order.pdf');
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('renderPurchasePdf', () => {
  it('writes a real A4 PDF file — real bytes inspected, not mocked', async () => {
    await renderPurchasePdf(SAMPLE_DATA, outputPath);

    const bytes = readFileSync(outputPath);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(500);
    // Same A4 dimensions confirmed directly in receipt-pdf.test.ts.
    expect(bytes.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]');
  });

  it('does not throw for a purchase with zero lines', async () => {
    await renderPurchasePdf({ ...SAMPLE_DATA, lines: [] }, outputPath);

    const bytes = readFileSync(outputPath);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('does not throw when optional supplier fields are null', async () => {
    await renderPurchasePdf(
      {
        ...SAMPLE_DATA,
        supplierShopName: null,
        supplierPhone: null,
        supplierCityArea: null,
      },
      outputPath,
    );

    const bytes = readFileSync(outputPath);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
