import type {
  CreateServiceChargeInput,
  UpdateServiceChargeInput as ContractsUpdateServiceChargeInput,
} from '@shop/contracts';
import type {
  CommissionMode,
  ServiceChargeRecord,
  ServiceChargeRepositoryPort,
} from './service-charge.repository.port.js';

/**
 * OD-16-1's core-layer half of "Zod + core" double validation
 * (docs/phases/PHASE_16.md §4 P16-1 exit criteria) — the Zod half is
 * packages/contracts/src/job/service-charge.ts's checkCommissionMode.
 * Exported so a test can call it directly, bypassing Zod, to prove the
 * core invariant holds on its own.
 */
export function assertCommissionModeConsistent(
  mode: CommissionMode,
  commissionAmountPaisa: number | null,
  commissionBp: number | null,
): void {
  if (mode === 'none') {
    if (commissionAmountPaisa !== null || commissionBp !== null) {
      throw new Error(
        'commissionMode "none" requires commissionAmountPaisa and commissionBp to both be null',
      );
    }
    return;
  }

  if (mode === 'fixed') {
    if (commissionAmountPaisa === null || commissionAmountPaisa <= 0) {
      throw new Error('commissionMode "fixed" requires a positive commissionAmountPaisa');
    }
    if (commissionBp !== null) {
      throw new Error('commissionMode "fixed" requires commissionBp to be null');
    }
    return;
  }

  // mode === 'bp'
  if (commissionBp === null || commissionBp < 1 || commissionBp > 10000) {
    throw new Error('commissionMode "bp" requires commissionBp between 1 and 10000');
  }
  if (commissionAmountPaisa !== null) {
    throw new Error('commissionMode "bp" requires commissionAmountPaisa to be null');
  }
}

export async function createServiceCharge(
  repo: ServiceChargeRepositoryPort,
  input: CreateServiceChargeInput,
): Promise<ServiceChargeRecord> {
  const commissionAmountPaisa = input.commissionAmountPaisa ?? null;
  const commissionBp = input.commissionBp ?? null;
  assertCommissionModeConsistent(input.commissionMode, commissionAmountPaisa, commissionBp);
  return repo.createServiceCharge({
    name: input.name,
    jobType: input.jobType ?? null,
    retailChargePaisa: input.retailChargePaisa,
    wholesaleChargePaisa: input.wholesaleChargePaisa ?? null,
    commissionAmountPaisa,
    commissionBp,
    typicalMinutes: input.typicalMinutes ?? null,
    notes: input.notes ?? null,
  });
}

export async function updateServiceCharge(
  repo: ServiceChargeRepositoryPort,
  input: ContractsUpdateServiceChargeInput,
): Promise<ServiceChargeRecord> {
  const commissionAmountPaisa = input.commissionAmountPaisa ?? null;
  const commissionBp = input.commissionBp ?? null;
  assertCommissionModeConsistent(input.commissionMode, commissionAmountPaisa, commissionBp);
  return repo.updateServiceCharge({
    id: input.id,
    name: input.name,
    jobType: input.jobType ?? null,
    retailChargePaisa: input.retailChargePaisa,
    wholesaleChargePaisa: input.wholesaleChargePaisa ?? null,
    commissionAmountPaisa,
    commissionBp,
    typicalMinutes: input.typicalMinutes ?? null,
    notes: input.notes ?? null,
  });
}

export async function toggleServiceCharge(
  repo: ServiceChargeRepositoryPort,
  id: string,
  isActive: boolean,
): Promise<ServiceChargeRecord> {
  return repo.toggleServiceCharge(id, isActive);
}

export async function listServiceChargesAdmin(
  repo: ServiceChargeRepositoryPort,
): Promise<readonly ServiceChargeRecord[]> {
  return repo.listServiceChargesAdmin();
}
