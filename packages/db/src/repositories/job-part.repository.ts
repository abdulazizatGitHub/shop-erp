import type { Kysely } from 'kysely';
import { newId } from '@shop/shared';
import {
  resolvePricePaisa,
  type IssuePartsToJobInput,
  type IssuePartsToJobResult,
  type IssuePartsToTechnicianInput,
  type IssuePartsToTechnicianResult,
  type JobIssueRepositoryPort,
  type JobPartRecord,
} from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

export class KyselyJobPartRepository implements JobIssueRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  private async resolveDefaultWarehouseId(trx: Kysely<Database>): Promise<string> {
    const row = await trx
      .selectFrom('warehouse')
      .select('id')
      .where('tenantId', '=', this.tenantId)
      .where('isDefault', '=', 1)
      .executeTakeFirst();
    if (!row) {
      throw new Error(`No default warehouse found for tenant ${this.tenantId} — has the seed run?`);
    }
    return row.id;
  }

  /**
   * Finds the technician's custody warehouse, or lazily creates one —
   * matching this codebase's existing lazy-creation precedent
   * (document_sequence rows in sale.repository.ts's nextSaleDocNo).
   * ADR-0006: each technician is a warehouse with
   * warehouse_kind='technician'; nothing in Phase 6 builds a separate
   * "onboard technician" step, so the first parts issue to a technician
   * is what brings their warehouse into existence.
   */
  private async resolveTechnicianWarehouseId(
    trx: Kysely<Database>,
    technicianPartyId: string,
    now: string,
  ): Promise<string> {
    const existing = await trx
      .selectFrom('warehouse')
      .select('id')
      .where('tenantId', '=', this.tenantId)
      .where('custodianPartyId', '=', technicianPartyId)
      .where('warehouseKind', '=', 'technician')
      .executeTakeFirst();
    if (existing) return existing.id;

    const technician = await trx
      .selectFrom('party')
      .select('name')
      .where('id', '=', technicianPartyId)
      .where('tenantId', '=', this.tenantId)
      .executeTakeFirst();
    if (!technician) {
      throw new Error(`Technician party ${technicianPartyId} not found`);
    }

    const warehouseId = newId();
    await trx
      .insertInto('warehouse')
      .values({
        id: warehouseId,
        tenantId: this.tenantId,
        name: `${technician.name} - Technician`,
        isDefault: 0,
        warehouseKind: 'technician',
        custodianPartyId: technicianPartyId,
      })
      .execute();

    await trx
      .insertInto('auditLog')
      .values({
        id: newId(),
        tenantId: this.tenantId,
        tableName: 'warehouse',
        recordId: warehouseId,
        action: 'insert',
        changedFields: null,
        oldValues: null,
        userId: null,
        deviceCode: this.deviceCode,
        createdAt: now,
      })
      .execute();

    return warehouseId;
  }

  /**
   * Shop -> Technician custody transfer. movement_type = 'transfer_out'
   * (Shop, negative) / 'transfer_in' (technician warehouse, positive).
   * NOT 'sale', NOT 'job_issue' — this is custody, not a sale or
   * consumption (ADR-0005/ADR-0006). unit_cost is snapshotted from
   * item.avg_cost on both legs, same convention sale.repository.ts uses.
   */
  async issuePartsToTechnician(
    input: IssuePartsToTechnicianInput,
  ): Promise<IssuePartsToTechnicianResult> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const fromWarehouseId =
          input.fromWarehouseId ?? (await this.resolveDefaultWarehouseId(trx));
        const now = new Date().toISOString();
        const toWarehouseId = await this.resolveTechnicianWarehouseId(
          trx,
          input.technicianPartyId,
          now,
        );

        const item = await trx
          .selectFrom('item')
          .select(['businessUnitId', 'avgCost'])
          .where('id', '=', input.itemId)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!item) {
          throw new Error(`Item ${input.itemId} not found`);
        }

        await trx
          .insertInto('stockMovement')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            itemId: input.itemId,
            warehouseId: fromWarehouseId,
            movementDate: now,
            movementType: 'transfer_out',
            quantity: -input.quantityMilli,
            unitCost: item.avgCost,
            serialId: null,
            sourceType: 'job_issue_transfer',
            sourceId: input.technicianPartyId,
            reason: null,
            reversedById: null,
            createdAt: now,
            createdBy: null,
            businessUnitId: item.businessUnitId,
          })
          .execute();

        await trx
          .insertInto('stockMovement')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            itemId: input.itemId,
            warehouseId: toWarehouseId,
            movementDate: now,
            movementType: 'transfer_in',
            quantity: input.quantityMilli,
            unitCost: item.avgCost,
            serialId: null,
            sourceType: 'job_issue_transfer',
            sourceId: input.technicianPartyId,
            reason: null,
            reversedById: null,
            createdAt: now,
            createdBy: null,
            businessUnitId: item.businessUnitId,
          })
          .execute();

        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'stock_movement',
            recordId: input.itemId,
            action: 'insert',
            changedFields: JSON.stringify({
              movementType: 'transfer_out/transfer_in',
              quantityMilli: input.quantityMilli,
            }),
            oldValues: null,
            userId: null,
            deviceCode: this.deviceCode,
            createdAt: now,
          })
          .execute();

        return {
          itemId: input.itemId,
          quantityMilli: input.quantityMilli,
          fromWarehouseId,
          toWarehouseId,
        };
      }),
    );
  }

  /**
   * Technician -> Job: real, final consumption. movement_type =
   * 'job_issue' (negative, FROM the technician's warehouse) — NEVER
   * 'sale'. job_part.unit_cost is NOT NULL (unlike sale_line.unit_cost,
   * which is nullable) — an item with no avg_cost yet cannot be issued
   * to a job, since there is no way to represent "unknown cost" in this
   * column; the caller must purchase the item at least once first.
   */
  async issuePartsToJob(input: IssuePartsToJobInput): Promise<IssuePartsToJobResult> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const now = new Date().toISOString();
        const technicianWarehouseId = await this.resolveTechnicianWarehouseId(
          trx,
          input.technicianPartyId,
          now,
        );

        const job = await trx
          .selectFrom('job')
          .select(['id'])
          .where('id', '=', input.jobId)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!job) {
          throw new Error(`Job ${input.jobId} not found`);
        }

        const item = await trx
          .selectFrom('item')
          .select(['businessUnitId', 'avgCost'])
          .where('id', '=', input.itemId)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!item) {
          throw new Error(`Item ${input.itemId} not found`);
        }
        if (!item.businessUnitId) {
          throw new Error(`Item ${input.itemId} has no business_unit_id set`);
        }
        // stock_movement.business_unit_id records which unit CAUSED the
        // movement (0002_business_units.sql's own comment names job_issue
        // as its example) — REPAIR consumed the part, even though the
        // part itself belongs to PARTS (job_part.business_unit_id below
        // stays item.businessUnitId — that column means something
        // different: which unit's billing this line belongs to).
        const repairUnit = await trx
          .selectFrom('businessUnit')
          .select('id')
          .where('tenantId', '=', this.tenantId)
          .where('code', '=', 'REPAIR')
          .executeTakeFirst();
        if (!repairUnit) {
          throw new Error(
            `No REPAIR business unit found for tenant ${this.tenantId} — has the seed run?`,
          );
        }
        if (item.avgCost === null) {
          throw new Error(
            `Item ${input.itemId} has no avg_cost set — cannot issue to a job until it has ` +
              `been purchased at least once (job_part.unit_cost is NOT NULL)`,
          );
        }

        let unitPricePaisa = input.unitPricePaisa;
        if (unitPricePaisa === null) {
          const priceLevelRows = await trx
            .selectFrom('priceLevel')
            .select(['id', 'isDefault'])
            .where('tenantId', '=', this.tenantId)
            .execute();
          const priceLevels = priceLevelRows.map((l) => ({
            id: l.id,
            isDefault: l.isDefault === 1,
          }));
          const itemPriceRows = await trx
            .selectFrom('itemPrice')
            .select(['priceLevelId', 'price'])
            .where('itemId', '=', input.itemId)
            .where('tenantId', '=', this.tenantId)
            .execute();
          unitPricePaisa = resolvePricePaisa(
            null,
            itemPriceRows.map((p) => ({ priceLevelId: p.priceLevelId, pricePaisa: p.price })),
            priceLevels,
          );
        }

        const jobPartId = newId();

        await trx
          .insertInto('jobPart')
          .values({
            id: jobPartId,
            tenantId: this.tenantId,
            jobId: input.jobId,
            itemId: input.itemId,
            quantity: input.quantityMilli,
            unitCost: item.avgCost,
            unitPrice: unitPricePaisa,
            serialId: null,
            isReturned: 0,
            issuedAt: now,
            issuedBy: null,
            businessUnitId: item.businessUnitId,
            isBillable: input.isBillable ? 1 : 0,
            entryType: 'issue',
            reversesJobPartId: null,
          })
          .execute();

        await trx
          .insertInto('stockMovement')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            itemId: input.itemId,
            warehouseId: technicianWarehouseId,
            movementDate: now,
            movementType: 'job_issue',
            quantity: -input.quantityMilli,
            unitCost: item.avgCost,
            serialId: null,
            sourceType: 'job_part',
            sourceId: jobPartId,
            reason: null,
            reversedById: null,
            createdAt: now,
            createdBy: null,
            businessUnitId: repairUnit.id,
          })
          .execute();

        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'job_part',
            recordId: jobPartId,
            action: 'insert',
            changedFields: null,
            oldValues: null,
            userId: null,
            deviceCode: this.deviceCode,
            createdAt: now,
          })
          .execute();

        return {
          jobPartId,
          jobId: input.jobId,
          itemId: input.itemId,
          quantityMilli: input.quantityMilli,
          unitCostPaisa: item.avgCost,
          unitPricePaisa,
          businessUnitId: item.businessUnitId,
        };
      }),
    );
  }

  /**
   * Plain filtered SELECT, oldest first — every job_part row (issue AND
   * return) for this job. No netting, no aggregation: the caller nets
   * issue/return pairs client-side, same as v_job_split does in SQL for
   * reporting (0012_job_split_v2.sql) but here left to the UI since this
   * is a raw line list, not a report total.
   */
  async listJobParts(jobId: string): Promise<readonly JobPartRecord[]> {
    const rows = await this.db
      .selectFrom('jobPart')
      .innerJoin('item', 'item.id', 'jobPart.itemId')
      .select([
        'jobPart.id',
        'jobPart.itemId',
        'item.nameEn as itemName',
        'jobPart.quantity',
        'jobPart.unitCost',
        'jobPart.unitPrice',
        'jobPart.entryType',
        'jobPart.reversesJobPartId',
        'jobPart.isBillable',
        'jobPart.issuedAt',
      ])
      .where('jobPart.tenantId', '=', this.tenantId)
      .where('jobPart.jobId', '=', jobId)
      .orderBy('jobPart.issuedAt', 'asc')
      .execute();

    return rows.map((r) => ({
      id: r.id,
      itemId: r.itemId,
      itemName: r.itemName,
      quantityMilli: r.quantity,
      unitCostPaisa: r.unitCost,
      unitPricePaisa: r.unitPrice,
      entryType: r.entryType,
      reversesJobPartId: r.reversesJobPartId,
      isBillable: r.isBillable === 1,
      issuedAt: r.issuedAt,
    }));
  }
}
