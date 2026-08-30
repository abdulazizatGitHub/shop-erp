import { sql, type Kysely } from 'kysely';
import type { Database } from '../kysely-schema.js';

// P4-1c. Read model for printing — sits alongside report.repository.ts
// but is not one of the P4-3 reports. sl.description is the item-name
// SNAPSHOT taken at sale time (see sale.repository.ts createSale,
// docs/DATABASE_RULES.md "Snapshots") — deliberately NOT joined to the
// live item table for the name, since a later item rename must not
// change a historical receipt. The UoM name DOES need a live join
// (CF-2): sale_uom_id when the line was sold in an alt unit, falling
// back to the item's stock UoM when it was sold in stock_uom (NULL
// sale_uom_id) — both are themselves permanent per-line/per-item
// references, not something that drifts the way a display name would.

export interface ReceiptSaleLine {
  readonly itemName: string;
  readonly quantityMilli: number;
  readonly unitName: string;
  readonly unitPricePaisa: number;
  readonly lineTotalPaisa: number;
}

export interface ReceiptSaleData {
  readonly docNo: string;
  readonly createdAt: string;
  readonly totalAmountPaisa: number;
  readonly lines: readonly ReceiptSaleLine[];
}

export async function getSaleReceiptData(
  db: Kysely<Database>,
  tenantId: string,
  saleId: string,
): Promise<ReceiptSaleData | null> {
  const saleHeader = await db
    .selectFrom('sale')
    .select(['docNo', 'createdAt', 'totalAmount'])
    .where('id', '=', saleId)
    .where('tenantId', '=', tenantId)
    .executeTakeFirst();

  if (!saleHeader) return null;

  const lineResult = await sql<{
    itemName: string | null;
    quantityMilli: number;
    unitName: string;
    unitPricePaisa: number;
    lineTotalPaisa: number;
  }>`
    SELECT
      sl.description                        AS itemName,
      sl.quantity                           AS quantityMilli,
      COALESCE(u_sale.name, u_stock.name)   AS unitName,
      sl.unit_price                         AS unitPricePaisa,
      sl.line_total                         AS lineTotalPaisa
    FROM        sale_line sl
    JOIN        item i ON i.id = sl.item_id
    LEFT JOIN   uom u_sale ON u_sale.id = sl.sale_uom_id
    JOIN        uom u_stock ON u_stock.id = i.stock_uom_id
    WHERE       sl.sale_id = ${saleId} AND sl.tenant_id = ${tenantId}
    ORDER BY    sl.line_no
  `.execute(db);

  return {
    docNo: saleHeader.docNo,
    createdAt: saleHeader.createdAt,
    totalAmountPaisa: saleHeader.totalAmount,
    lines: lineResult.rows.map((row) => ({
      itemName: row.itemName ?? '(unknown item)',
      quantityMilli: row.quantityMilli,
      unitName: row.unitName,
      unitPricePaisa: row.unitPricePaisa,
      lineTotalPaisa: row.lineTotalPaisa,
    })),
  };
}
