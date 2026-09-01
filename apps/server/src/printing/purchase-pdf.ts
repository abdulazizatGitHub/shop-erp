import { createWriteStream } from 'node:fs';
import PDFDocument from 'pdfkit';
import { Money, Qty } from '@shop/shared';
import type { PurchasePrintData } from '@shop/db';

// pdfkit's own built-in A4 dimensions (confirmed in receipt-pdf.test.ts by
// generating a real PDF and reading its /MediaBox directly): 595.28 x
// 841.89 pt. Hardcoded — no page-size parameter, per spec.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COL_ITEM_X = MARGIN;
const COL_ITEM_W = 180;
const COL_QTY_X = COL_ITEM_X + COL_ITEM_W;
const COL_QTY_W = 70;
const COL_UNIT_X = COL_QTY_X + COL_QTY_W;
const COL_UNIT_W = 70;
const COL_UNITCOST_X = COL_UNIT_X + COL_UNIT_W;
const COL_UNITCOST_W = 90;
const COL_TOTAL_X = COL_UNITCOST_X + COL_UNITCOST_W;
const COL_TOTAL_W = MARGIN + CONTENT_WIDTH - COL_TOTAL_X;

const HEADER_ROW_HEIGHT = 22;
const DATA_ROW_HEIGHT = 20;
const CELL_PADDING_X = 4;
const CELL_PADDING_Y = 6;

/**
 * New drawing logic — receipt-pdf.ts's renderReceiptPdf only draws one
 * pre-built plain-text layout string (doc.text(layoutText)); there is no
 * existing table/multi-column pdfkit code anywhere in this codebase to
 * reuse. Writes directly to outputPath (unlike renderReceiptPdf, which
 * returns a Buffer for a separate save step) — per spec.
 *
 * Known verification gap, same class as P4-2c's documented one for
 * receipt/invoice PDFs: pdfkit compresses the content stream, so exact
 * text position/wrapping is not inspectable from the raw bytes. Only
 * structure (magic bytes, /MediaBox, non-trivial size) is verified in
 * purchase-pdf.test.ts — not a substitute for an actual printed page.
 */
export function renderPurchasePdf(data: PurchasePrintData, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    const stream = createWriteStream(outputPath);

    stream.on('finish', () => {
      resolve();
    });
    stream.on('error', (err: unknown) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });
    doc.on('error', (err: unknown) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });

    doc.pipe(stream);

    // TOP ROW — shop name (left) / "PURCHASE ORDER" + doc no + date (right).
    const topY = doc.y;
    doc.fontSize(18).font('Helvetica-Bold').text(data.shopName, MARGIN, topY, { width: 300 });
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('PURCHASE ORDER', MARGIN, topY, { width: CONTENT_WIDTH, align: 'right' });
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(data.docNo, MARGIN, topY + 20, { width: CONTENT_WIDTH, align: 'right' });
    doc.text(data.purchaseDate, MARGIN, topY + 34, { width: CONTENT_WIDTH, align: 'right' });

    doc.x = MARGIN;
    doc.y = topY + 60;

    // SUPPLIER BLOCK — auto-flowing text, one field per line.
    doc.fontSize(11).font('Helvetica-Bold').text('Supplier:');
    doc.text(data.supplierName);
    doc.font('Helvetica').fontSize(10);
    if (data.supplierShopName) doc.text(data.supplierShopName);
    if (data.supplierPhone) doc.text(data.supplierPhone);
    if (data.supplierCityArea) doc.text(data.supplierCityArea);

    doc.moveDown(1);

    // ITEMS TABLE — hand-drawn: outer border + header separator line.
    const tableTop = doc.y;
    const tableHeight = HEADER_ROW_HEIGHT + data.lines.length * DATA_ROW_HEIGHT;

    doc.rect(MARGIN, tableTop, CONTENT_WIDTH, tableHeight).stroke();
    doc
      .moveTo(MARGIN, tableTop + HEADER_ROW_HEIGHT)
      .lineTo(MARGIN + CONTENT_WIDTH, tableTop + HEADER_ROW_HEIGHT)
      .stroke();

    doc.fontSize(10).font('Helvetica-Bold');
    const headerY = tableTop + CELL_PADDING_Y;
    doc.text('Item', COL_ITEM_X + CELL_PADDING_X, headerY, { width: COL_ITEM_W - CELL_PADDING_X });
    doc.text('Qty', COL_QTY_X, headerY, { width: COL_QTY_W - CELL_PADDING_X, align: 'right' });
    doc.text('Unit', COL_UNIT_X + CELL_PADDING_X, headerY, {
      width: COL_UNIT_W - CELL_PADDING_X,
    });
    doc.text('Unit Cost', COL_UNITCOST_X, headerY, {
      width: COL_UNITCOST_W - CELL_PADDING_X,
      align: 'right',
    });
    doc.text('Total', COL_TOTAL_X, headerY, {
      width: COL_TOTAL_W - CELL_PADDING_X,
      align: 'right',
    });

    doc.font('Helvetica').fontSize(9);
    data.lines.forEach((line, index) => {
      const rowY = tableTop + HEADER_ROW_HEIGHT + index * DATA_ROW_HEIGHT + CELL_PADDING_Y - 1;
      doc.text(line.itemName, COL_ITEM_X + CELL_PADDING_X, rowY, {
        width: COL_ITEM_W - CELL_PADDING_X,
      });
      doc.text(Qty.format(Qty.of(line.quantityMilli)), COL_QTY_X, rowY, {
        width: COL_QTY_W - CELL_PADDING_X,
        align: 'right',
      });
      doc.text(line.unitName, COL_UNIT_X + CELL_PADDING_X, rowY, {
        width: COL_UNIT_W - CELL_PADDING_X,
      });
      doc.text(Money.format(Money.of(line.unitCostPaisa)), COL_UNITCOST_X, rowY, {
        width: COL_UNITCOST_W - CELL_PADDING_X,
        align: 'right',
      });
      doc.text(Money.format(Money.of(line.lineTotalPaisa)), COL_TOTAL_X, rowY, {
        width: COL_TOTAL_W - CELL_PADDING_X,
        align: 'right',
      });
    });

    // TOTALS BLOCK — right-aligned, below the table's own bottom border.
    doc.x = MARGIN;
    doc.y = tableTop + tableHeight + 16;
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text(`Grand Total: ${Money.format(Money.of(data.totalAmountPaisa))}`, MARGIN, doc.y, {
        width: CONTENT_WIDTH,
        align: 'right',
      });
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Payment: ${data.paymentMode === 'cash' ? 'Cash' : 'Credit'}`, MARGIN, doc.y, {
        width: CONTENT_WIDTH,
        align: 'right',
      });

    // FOOTER — small, muted, fixed at the bottom of the page.
    doc
      .fontSize(8)
      .fillColor('gray')
      .text(`Printed: ${new Date().toISOString()}`, MARGIN, PAGE_HEIGHT - MARGIN - 14, {
        width: CONTENT_WIDTH,
      });
    doc.fillColor('black');

    doc.end();
  });
}
