import type {
  AssignTechnicianInput as CreateAssignTechnicianInput,
  CreateJobInput,
  JobStatusTransitionInput as CreateJobStatusTransitionInput,
} from '@shop/contracts';
import type { JobRecord, JobRepositoryPort } from './job.repository.port.js';

export async function createJob(
  repo: JobRepositoryPort,
  input: CreateJobInput,
): Promise<JobRecord> {
  return repo.createJob({
    customerId: input.customerId,
    customerNameAdhoc: input.customerNameAdhoc,
    customerPhone: input.customerPhone,
    jobType: input.jobType,
    applianceType: input.applianceType,
    applianceBrand: input.applianceBrand,
    applianceModel: input.applianceModel,
    applianceSerial: input.applianceSerial,
    reportedFault: input.reportedFault,
    receivedDate: input.receivedDate,
    promisedDate: input.promisedDate,
    estimateAmountPaisa: input.estimateAmountPaisa,
    assignedTo: input.assignedTo,
    notes: input.notes,
  });
}

export async function assignTechnician(
  repo: JobRepositoryPort,
  input: CreateAssignTechnicianInput,
): Promise<JobRecord> {
  return repo.assignTechnician({ jobId: input.jobId, technicianPartyId: input.technicianPartyId });
}

export async function transitionJobStatus(
  repo: JobRepositoryPort,
  input: CreateJobStatusTransitionInput,
): Promise<JobRecord> {
  return repo.updateJobStatus({ jobId: input.jobId, toStatus: input.toStatus, note: input.note });
}
