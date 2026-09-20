import type { CancelJobInput as ContractsCancelJobInput } from '@shop/contracts';
import type { JobCancelRepositoryPort } from './job-cancel.repository.port.js';
import type { JobRecord } from './job.repository.port.js';

export async function cancelJob(
  repo: JobCancelRepositoryPort,
  input: ContractsCancelJobInput,
): Promise<JobRecord> {
  return repo.cancelJob(input);
}
