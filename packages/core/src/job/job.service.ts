import type {
  AssignTechnicianInput as CreateAssignTechnicianInput,
  CreateJobInput,
  JobStatusTransitionInput as CreateJobStatusTransitionInput,
  UnassignTechnicianInput as CreateUnassignTechnicianInput,
} from '@shop/contracts';
import type { JobTechnicianRepositoryPort } from './job-technician.repository.port.js';
import type { JobRecord, JobRepositoryPort } from './job.repository.port.js';

export async function createJob(
  repo: JobRepositoryPort,
  input: CreateJobInput,
): Promise<JobRecord> {
  return repo.createJob({
    customerId: input.customerId,
    customerNameAdhoc: input.customerNameAdhoc,
    customerPhone: input.customerPhone,
    jobClientId: input.jobClientId,
    newClient: input.newClient,
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

/**
 * P16-3c — replaces the handler's former direct
 * `repo.unassignTechnician(id)` call (OD-16-5: "replacing the handler's
 * direct repository call"). The actual lock/reason enforcement lives in
 * the repository implementation (it must derive the job's current
 * status inside its own write transaction — see
 * job-technician.repository.port.ts's doc comment); this function is
 * the single core-layer entry point every handler must call instead of
 * touching the repository directly, matching assignTechnician's own
 * shape immediately above.
 */
export async function unassignTechnician(
  repo: JobTechnicianRepositoryPort,
  input: CreateUnassignTechnicianInput,
): Promise<void> {
  return repo.unassignTechnician(input.id, input.reason);
}

export async function transitionJobStatus(
  repo: JobRepositoryPort,
  input: CreateJobStatusTransitionInput,
): Promise<JobRecord> {
  return repo.updateJobStatus({ jobId: input.jobId, toStatus: input.toStatus, note: input.note });
}
