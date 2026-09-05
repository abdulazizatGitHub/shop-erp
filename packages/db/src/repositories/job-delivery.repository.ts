import { Money } from '@shop/shared';
import { formatDisplayDocNumber, newId } from '@shop/shared';
import { computeLineTotalPaisa } from '@shop/core';
import type {
  DeliverJobInput,
  DeliverJobResult,
  JobDeliveryRepositoryPort,
  JobStatus,
} from '@shop/core';
import type { Kysely } from 'kysely';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

const SALE_CODE_DOC_TYPE = 'sale';
const SALE_CODE_PREFIX = 'INV';

interface ComputedLine {
  readonly lineKind: 'part' | 'labour';
  readonly itemId: string | null;
  readonly description: string;
  readonly quantityMilli: number;
  readonly unitPricePaisa: number;
  readonly unitCostPaisa: number;
  readonly lineTotalPaisa: number;
  readonly businessUnitId: string;
  readonly jobPartId: string | null;
  readonly serviceChargeId: string | null;
  readonly payerPartyId: string | null;
  readonly revenueType: string;
}

export class KyselyJobDeliveryRepository implements JobDeliveryRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  /** Exact copy of sale.repository.ts's nextSaleDocNo — job deliveries
   * share the SAME INV-NNNN sequence as counter sales (both are `sale`
   * rows), per the agreed P6-5 shape. */
  private async nextSaleDocNo(trx: Kysely<Database>): Promise<string> {
    const existing = await trx
      .selectFrom('documentSequence')
      .select('nextNumber')
      .where('tenantId', '=', this.tenantId)
      .where('docType', '=', SALE_CODE_DOC_TYPE)
      .where('deviceCode', '=', this.deviceCode)
      .executeTakeFirst();

    const nextNumber = existing?.nextNumber ?? 1;

    if (existing) {
      await trx
        .updateTable('documentSequence')
        .set({ nextNumber: nextNumber + 1 })
        .where('tenantId', '=', this.tenantId)
        .where('docType', '=', SALE_CODE_DOC_TYPE)
        .where('deviceCode', '=', this.deviceCode)
        .execute();
    } else {
      await trx
        .insertInto('documentSequence')
        .values({
          tenantId: this.tenantId,
          docType: SALE_CODE_DOC_TYPE,
          prefix: SALE_CODE_PREFIX,
          deviceCode: this.deviceCode,
          nextNumber: 2,
        })
        .execute();
    }

    return formatDisplayDocNumber(SALE_CODE_PREFIX, nextNumber);
  }

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

  /** Same latest-history-row pattern as job.repository.ts's private deriveStatus. */
  private async deriveJobStatus(trx: Kysely<Database>, jobId: string): Promise<JobStatus> {
    const job = await trx
      .selectFrom('job')
      .select('status')
      .where('id', '=', jobId)
      .where('tenantId', '=', this.tenantId)
      .executeTakeFirstOrThrow();
    const latest = await trx
      .selectFrom('jobStatusHistory')
      .select('toStatus')
      .where('jobId', '=', jobId)
      .where('tenantId', '=', this.tenantId)
      .orderBy('changedAt', 'desc')
      .orderBy('id', 'desc')
      .limit(1)
      .executeTakeFirst();
    return (latest?.toStatus ?? job.status) as JobStatus;
  }

  /**
   * See job-delivery.repository.port.ts's doc comment for the full
   * transaction contract. No stock_movement for job-sourced part lines
   * (P6-4's job_issue is the real, final stock event). Never creates an
   * internal_transfer (ADR-0005). Multi-payer partial payment is
   * rejected before this method is even called — see job-delivery.ts's
   * validateMultiPayerPayment, run in the service layer.
   */
  async deliverJob(input: DeliverJobInput): Promise<DeliverJobResult> {
    if (input.partLines.length + input.labourLines.length === 0) {
      throw new Error('A delivery must have at least one line');
    }

    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const job = await trx
          .selectFrom('job')
          .select(['id', 'customerId'])
          .where('id', '=', input.jobId)
          .where('tenantId', '=', this.tenantId)
          .executeTakeFirst();
        if (!job) {
          throw new Error(`Job ${input.jobId} not found`);
        }

        const partsUnit = await trx
          .selectFrom('businessUnit')
          .select('id')
          .where('tenantId', '=', this.tenantId)
          .where('code', '=', 'PARTS')
          .executeTakeFirst();
        const repairUnit = await trx
          .selectFrom('businessUnit')
          .select('id')
          .where('tenantId', '=', this.tenantId)
          .where('code', '=', 'REPAIR')
          .executeTakeFirst();
        if (!partsUnit || !repairUnit) {
          throw new Error(
            `PARTS/REPAIR business units not found for tenant ${this.tenantId} — has the seed run?`,
          );
        }

        const computedLines: ComputedLine[] = [];

        for (const line of input.partLines) {
          const jobPart = await trx
            .selectFrom('jobPart')
            .select(['id', 'itemId', 'quantity', 'unitCost'])
            .where('id', '=', line.jobPartId)
            .where('tenantId', '=', this.tenantId)
            .executeTakeFirst();
          if (!jobPart) {
            throw new Error(`job_part ${line.jobPartId} not found`);
          }
          const item = await trx
            .selectFrom('item')
            .select('nameEn')
            .where('id', '=', jobPart.itemId)
            .where('tenantId', '=', this.tenantId)
            .executeTakeFirst();
          if (!item) {
            throw new Error(`Item ${jobPart.itemId} not found`);
          }

          computedLines.push({
            lineKind: 'part',
            itemId: jobPart.itemId,
            description: item.nameEn,
            quantityMilli: jobPart.quantity,
            unitPricePaisa: line.unitPricePaisa,
            unitCostPaisa: jobPart.unitCost, // copied from the job_part snapshot, never re-derived
            lineTotalPaisa: computeLineTotalPaisa(line.unitPricePaisa, jobPart.quantity),
            businessUnitId: partsUnit.id,
            jobPartId: jobPart.id,
            serviceChargeId: null,
            payerPartyId: line.payerPartyId,
            revenueType: line.revenueType,
          });
        }

        for (const line of input.labourLines) {
          const serviceCharge = await trx
            .selectFrom('serviceCharge')
            .select(['id', 'name', 'retailCharge'])
            .where('id', '=', line.serviceChargeId)
            .where('tenantId', '=', this.tenantId)
            .executeTakeFirst();
          if (!serviceCharge) {
            throw new Error(`service_charge ${line.serviceChargeId} not found`);
          }
          const unitPricePaisa = line.unitPricePaisa ?? serviceCharge.retailCharge;
          const quantityMilli = 1000;

          computedLines.push({
            lineKind: 'labour',
            itemId: null,
            description: serviceCharge.name,
            quantityMilli,
            unitPricePaisa,
            unitCostPaisa: 0, // labour COGS is tracked via staff wages in Phase 7, not here
            lineTotalPaisa: computeLineTotalPaisa(unitPricePaisa, quantityMilli),
            businessUnitId: repairUnit.id,
            jobPartId: null,
            serviceChargeId: serviceCharge.id,
            payerPartyId: line.payerPartyId,
            revenueType: line.revenueType,
          });
        }

        const totalAmountPaisa = Money.sum(computedLines.map((l) => Money.of(l.lineTotalPaisa)));

        const payerTotals = new Map<string, number>();
        for (const line of computedLines) {
          if (line.payerPartyId) {
            payerTotals.set(
              line.payerPartyId,
              (payerTotals.get(line.payerPartyId) ?? 0) + line.lineTotalPaisa,
            );
          }
        }

        const docNo = await this.nextSaleDocNo(trx);
        const saleId = newId();
        const now = new Date().toISOString();
        const warehouseId = await this.resolveDefaultWarehouseId(trx);
        const defaultPriceLevel = await trx
          .selectFrom('priceLevel')
          .select('id')
          .where('tenantId', '=', this.tenantId)
          .where('isDefault', '=', 1)
          .executeTakeFirst();
        if (!defaultPriceLevel) {
          throw new Error('No default (Retail) price level configured — has the seed run?');
        }

        await trx
          .insertInto('sale')
          .values({
            id: saleId,
            tenantId: this.tenantId,
            docNo,
            customerId: job.customerId,
            warehouseId,
            priceLevelId: defaultPriceLevel.id,
            saleDate: input.saleDate,
            saleType: 'job',
            subtotal: totalAmountPaisa,
            discountAmount: 0,
            taxAmount: 0,
            totalAmount: totalAmountPaisa,
            paidAmount: input.paidPaisa,
            paymentMode: input.paidPaisa >= totalAmountPaisa ? 'cash' : 'credit',
            status: 'confirmed',
            notes: null,
            createdAt: now,
            updatedAt: now,
            createdBy: null,
            jobId: input.jobId,
          })
          .execute();

        for (const [index, line] of computedLines.entries()) {
          await trx
            .insertInto('saleLine')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              saleId,
              lineNo: index + 1,
              itemId: line.itemId,
              description: line.description,
              quantity: line.quantityMilli,
              unitPrice: line.unitPricePaisa,
              unitCost: line.unitCostPaisa,
              discountAmount: 0,
              taxRate: 0,
              taxAmount: 0,
              lineTotal: line.lineTotalPaisa,
              businessUnitId: line.businessUnitId,
              saleUomId: null,
              saleToStockFactor: null,
              lineKind: line.lineKind,
              jobPartId: line.jobPartId,
              serviceChargeId: line.serviceChargeId,
              payerPartyId: line.payerPartyId,
              revenueType: line.revenueType,
            })
            .execute();
          // NO stock_movement insert here — P6-4's job_issue movement is
          // the real, final stock event for job-sourced part lines.
        }

        const singlePayer = payerTotals.size === 1;
        for (const [payerId, amountPaisa] of payerTotals) {
          const outstandingPaisa = singlePayer ? amountPaisa - input.paidPaisa : amountPaisa;
          if (outstandingPaisa > 0) {
            await trx
              .insertInto('partyLedger')
              .values({
                id: newId(),
                tenantId: this.tenantId,
                partyId: payerId,
                entryDate: input.saleDate,
                entryType: 'sale',
                amount: outstandingPaisa,
                runningNote: null,
                sourceType: 'sale',
                sourceId: saleId,
                reversedById: null,
                createdAt: now,
                createdBy: null,
                billReference: null,
                dueDate: null,
                billNotes: null,
              })
              .execute();
          }
        }

        await trx
          .updateTable('job')
          .set({ saleId, updatedAt: now })
          .where('id', '=', input.jobId)
          .where('tenantId', '=', this.tenantId)
          .execute();

        const fromStatus = await this.deriveJobStatus(trx, input.jobId);
        await trx
          .insertInto('jobStatusHistory')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            jobId: input.jobId,
            fromStatus,
            toStatus: 'delivered',
            changedAt: now,
            changedBy: null,
            note: null,
          })
          .execute();

        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'sale',
            recordId: saleId,
            action: 'insert',
            changedFields: null,
            oldValues: null,
            userId: null,
            deviceCode: this.deviceCode,
            createdAt: now,
          })
          .execute();

        await trx
          .insertInto('syncOutbox')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'sale',
            recordId: saleId,
            operation: 'insert',
            payload: null,
            createdAt: now,
            syncedAt: null,
            syncAttempts: 0,
            lastError: null,
          })
          .execute();

        return { id: saleId, docNo, totalAmountPaisa };
      }),
    );
  }
}
