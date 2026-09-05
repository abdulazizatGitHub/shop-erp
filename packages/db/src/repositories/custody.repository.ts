import type { Kysely } from 'kysely';
import { newId } from '@shop/shared';
import type {
  CustodyReconciliationResult,
  CustodyRepositoryPort,
  RecordCustodyReconciliationInput,
} from '@shop/core';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

export class KyselyCustodyRepository implements CustodyRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  /**
   * INSERT-only. action_taken is always 'noted' — deduction requires a
   * separate, explicit owner action outside this flow (ADR-0006). Never
   * inserts a party_ledger row.
   */
  async recordCustodyReconciliation(
    input: RecordCustodyReconciliationInput,
  ): Promise<CustodyReconciliationResult> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const id = newId();
        const now = new Date().toISOString();

        await trx
          .insertInto('custodyReconciliation')
          .values({
            id,
            tenantId: this.tenantId,
            warehouseId: input.warehouseId,
            custodianPartyId: input.custodianPartyId,
            reconciledOn: input.reconciledOn,
            shortageValue: input.shortageValuePaisa,
            actionTaken: 'noted',
            ledgerEntryId: null,
            notes: input.notes,
            createdAt: now,
            createdBy: null,
          })
          .execute();

        await trx
          .insertInto('auditLog')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            tableName: 'custody_reconciliation',
            recordId: id,
            action: 'insert',
            changedFields: null,
            oldValues: null,
            userId: null,
            deviceCode: this.deviceCode,
            createdAt: now,
          })
          .execute();

        return {
          id,
          warehouseId: input.warehouseId,
          custodianPartyId: input.custodianPartyId,
          reconciledOn: input.reconciledOn,
          shortageValuePaisa: input.shortageValuePaisa,
          actionTaken: 'noted',
        };
      }),
    );
  }
}
