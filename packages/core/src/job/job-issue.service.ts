import type {
  IssuePartsToJobInput as CreateIssuePartsToJobInput,
  IssuePartsToTechnicianInput as CreateIssuePartsToTechnicianInput,
} from '@shop/contracts';
import type {
  IssuePartsToJobResult,
  IssuePartsToTechnicianResult,
  JobIssueRepositoryPort,
} from './job-issue.repository.port.js';

export async function issuePartsToTechnician(
  repo: JobIssueRepositoryPort,
  input: CreateIssuePartsToTechnicianInput,
): Promise<IssuePartsToTechnicianResult> {
  return repo.issuePartsToTechnician({
    itemId: input.itemId,
    quantityMilli: input.quantityMilli,
    fromWarehouseId: input.fromWarehouseId,
    technicianPartyId: input.technicianPartyId,
  });
}

export async function issuePartsToJob(
  repo: JobIssueRepositoryPort,
  input: CreateIssuePartsToJobInput,
): Promise<IssuePartsToJobResult> {
  return repo.issuePartsToJob({
    jobId: input.jobId,
    itemId: input.itemId,
    quantityMilli: input.quantityMilli,
    technicianPartyId: input.technicianPartyId,
    unitPricePaisa: input.unitPricePaisa,
    isBillable: input.isBillable,
  });
}
