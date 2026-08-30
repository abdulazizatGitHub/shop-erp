import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveReceiptToTempFile } from './receipt-file.js';

const writtenPaths: string[] = [];

afterEach(() => {
  for (const p of writtenPaths.splice(0)) {
    rmSync(p, { force: true });
  }
});

describe('saveReceiptToTempFile (P4-1c)', () => {
  it('writes the PDF buffer to os.tmpdir() with the required filename pattern, real file not mocked', async () => {
    const saleId = '11111111-1111-1111-1111-111111111111';
    const now = new Date('2026-08-29T14:30:05.000Z');
    const fakePdfBytes = Buffer.from('%PDF-1.3 fake content for this test');

    const filePath = await saveReceiptToTempFile(saleId, fakePdfBytes, now);
    writtenPaths.push(filePath);

    // Required pattern: receipt-{saleId}-{timestamp}.pdf, in os.tmpdir()
    expect(path.dirname(filePath)).toBe(tmpdir());
    const filename = path.basename(filePath);
    expect(filename.startsWith(`receipt-${saleId}-`)).toBe(true);
    expect(filename.endsWith('.pdf')).toBe(true);

    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath)).toEqual(fakePdfBytes);
  });

  it('two saves for the same sale at different timestamps produce two distinct files', async () => {
    const saleId = '22222222-2222-2222-2222-222222222222';
    const bytes = Buffer.from('%PDF-1.3 x');

    const path1 = await saveReceiptToTempFile(saleId, bytes, new Date('2026-08-29T10:00:00.000Z'));
    const path2 = await saveReceiptToTempFile(saleId, bytes, new Date('2026-08-29T10:00:01.000Z'));
    writtenPaths.push(path1, path2);

    expect(path1).not.toBe(path2);
    expect(existsSync(path1)).toBe(true);
    expect(existsSync(path2)).toBe(true);
  });
});
