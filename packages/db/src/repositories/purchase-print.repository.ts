import { sql, type Kysely } from 'kysely';
import type { Database } from '../kysely-schema.js';
import { getShopName } from './setting.repository.js';

export interface PurchasePrintLine {
  readonly itemName: string;
  readonly quantityMilli: number;
  readonly unitName: string;
  readonly unitCostPaisa: number;
  readonly lineTotalPaisa: number;
}

export interface PurchasePrintData {
  readonly docNo: string;
  readonly purchaseDate: string;
  readonly paymentMode: 'cash' | 'credit';
  readonly supplierName: string;
  readonly supplierShopName: string | null;
  readonly supplierPhone: string | null;
  readonly supplierCityArea: string | null;
  readonly lines: readonly PurchasePrintLine[];
  readonly totalAmountPaisa: number;
  readonly shopName: string;
}

interface PurchaseHeaderRow {
  docNo: string;
  purchaseDate: string;
  paymentMode: string | null;
  supplierId: string;
  totalAmount: number;
}

interface SupplierRow {
  name: string;
  shopName: string | null;
  phone: string | null;
  cityArea: string | null;
}

interface PrintLineRow {
  itemName: string;
  quantityMilli: number;
  unitName: string | null;
  unitCostPaisa: number;
  lineTotalPaisa: number;
}

/**
 * P4.5 purchase-order printing. Lines show the purchase UoM (what was
 * actually ordered/entered — purchase_line.quantity/unit_cost are
 * already in purchase-UoM terms per NewPurchaseLineInput's own
 * comment), falling back to the item's stock UoM name when no distinct
 * purchase UoM was ever set on the item (item.purchase_uom_id is
 * nullable). All column names verified against 0001_init.sql /
 * kysely-schema.ts directly, not assumed.
 */
export async function getPurchasePrintData(
  db: Kysely<Database>,
  tenantId: string,
  purchaseId: string,
): Promise<PurchasePrintData | null> {
  const purchase = (await db
    .selectFrom('purchase')
    .select(['docNo', 'purchaseDate', 'paymentMode', 'supplierId', 'totalAmount'])
    .where('id', '=', purchaseId)
    .where('tenantId', '=', tenantId)
    .executeTakeFirst()) as PurchaseHeaderRow | undefined;

  if (!purchase || !purchase.paymentMode) return null;

  const supplier = (await db
    .selectFrom('party')
    .select(['name', 'shopName', 'phone', 'cityArea'])
    .where('id', '=', purchase.supplierId)
    .where('tenantId', '=', tenantId)
    .executeTakeFirst()) as SupplierRow | undefined;

  // Cannot happen in practice — purchase.supplier_id is a required FK —
  // but keeps this function honest about its own return type.
  if (!supplier) return null;

  const lineRows = await sql<PrintLineRow>`
    SELECT
      i.name_en                   AS itemName,
      pl.quantity                 AS quantityMilli,
      COALESCE(pu.name, su.name)  AS unitName,
      pl.unit_cost                AS unitCostPaisa,
      pl.line_total                AS lineTotalPaisa
    FROM        purchase_line pl
    JOIN        item i ON i.id = pl.item_id
    LEFT JOIN   uom pu ON pu.id = i.purchase_uom_id
    JOIN        uom su ON su.id = i.stock_uom_id
    WHERE       pl.purchase_id = ${purchaseId} AND pl.tenant_id = ${tenantId}
    ORDER BY    pl.line_no ASC
  `.execute(db);

  const shopName = await getShopName(db, tenantId);

  return {
    docNo: purchase.docNo,
    purchaseDate: purchase.purchaseDate,
    paymentMode: purchase.paymentMode as 'cash' | 'credit',
    supplierName: supplier.name,
    supplierShopName: supplier.shopName,
    supplierPhone: supplier.phone,
    supplierCityArea: supplier.cityArea,
    lines: lineRows.rows.map((row) => ({
      itemName: row.itemName,
      quantityMilli: row.quantityMilli,
      unitName: row.unitName ?? '',
      unitCostPaisa: row.unitCostPaisa,
      lineTotalPaisa: row.lineTotalPaisa,
    })),
    totalAmountPaisa: purchase.totalAmount,
    shopName,
  };
}
