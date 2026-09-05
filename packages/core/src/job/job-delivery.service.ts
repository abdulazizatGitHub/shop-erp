import type { DeliverJobInput as CreateDeliverJobInput } from '@shop/contracts';
import { distinctPayerIds, validateMultiPayerPayment } from './job-delivery.js';
import type {
  DeliverJobResult,
  JobDeliveryRepositoryPort,
} from './job-delivery.repository.port.js';

export async function deliverJob(
  repo: JobDeliveryRepositoryPort,
  input: CreateDeliverJobInput,
): Promise<DeliverJobResult> {
  // Pure, DB-free validation runs before the transaction opens.
  const payerIds = distinctPayerIds([...input.partLines, ...input.labourLines]);
  validateMultiPayerPayment(payerIds, input.paidPaisa);

  return repo.deliverJob({
    jobId: input.jobId,
    saleDate: input.saleDate,
    partLines: input.partLines.map((l) => ({
      jobPartId: l.jobPartId,
      unitPricePaisa: l.unitPricePaisa,
      payerPartyId: l.payerPartyId,
      revenueType: l.revenueType,
    })),
    labourLines: input.labourLines.map((l) => ({
      serviceChargeId: l.serviceChargeId,
      unitPricePaisa: l.unitPricePaisa,
      payerPartyId: l.payerPartyId,
      revenueType: l.revenueType,
    })),
    paidPaisa: input.paidPaisa,
  });
}
