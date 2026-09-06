import type { ListAdvancesInput, RecordAdvanceInput } from '@shop/contracts';
import type { AdvanceRecord, AdvanceRepositoryPort } from './advance.repository.port.js';

/**
 * Pure orchestration, no SQL — job.service.ts's plain-exported-function
 * pattern, not a class. No tenantId parameter: the repo already knows
 * its own tenant (constructor-injected), same as every other service in
 * this codebase.
 */
export async function recordAdvance(
  repo: AdvanceRepositoryPort,
  input: RecordAdvanceInput,
): Promise<AdvanceRecord> {
  return repo.recordAdvance({
    staffId: input.staffId,
    date: input.date,
    amountPaisa: input.amountPaisa,
    notes: input.notes ?? null,
  });
}

export async function listAdvances(
  repo: AdvanceRepositoryPort,
  input: ListAdvancesInput,
): Promise<readonly AdvanceRecord[]> {
  return repo.listAdvances({
    staffId: input.staffId,
    year: input.year,
    month: input.month,
  });
}
