import type { RecordCustodyReconciliationInput as CreateRecordCustodyReconciliationInput } from '@shop/contracts';
import type {
  CustodyReconciliationResult,
  CustodyRepositoryPort,
} from './custody.repository.port.js';

export async function recordCustodyReconciliation(
  repo: CustodyRepositoryPort,
  input: CreateRecordCustodyReconciliationInput,
): Promise<CustodyReconciliationResult> {
  return repo.recordCustodyReconciliation({
    warehouseId: input.warehouseId,
    custodianPartyId: input.custodianPartyId,
    reconciledOn: input.reconciledOn,
    shortageValuePaisa: input.shortageValuePaisa,
    notes: input.notes,
  });
}
