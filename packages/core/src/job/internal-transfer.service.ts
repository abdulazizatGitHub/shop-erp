import type { CreateInternalTransferInput } from '@shop/contracts';
import type {
  InternalTransferRepositoryPort,
  NewInternalTransferResult,
} from './internal-transfer.repository.port.js';

export async function createInternalTransfer(
  repo: InternalTransferRepositoryPort,
  input: CreateInternalTransferInput,
): Promise<NewInternalTransferResult> {
  return repo.createInternalTransfer({
    transferDate: input.transferDate,
    reason: input.reason,
    jobId: input.jobId,
    lines: input.lines.map((l) => ({ itemId: l.itemId, quantityMilli: l.quantityMilli })),
    notes: input.notes,
  });
}
