import type { UpdateJobDetailsInput as ContractsUpdateJobDetailsInput } from '@shop/contracts';
import type { JobDetailsRepositoryPort } from './job-details.repository.port.js';
import type { JobRecord } from './job.repository.port.js';

export async function updateJobDetails(
  repo: JobDetailsRepositoryPort,
  input: ContractsUpdateJobDetailsInput,
): Promise<JobRecord> {
  return repo.updateJobDetails(input);
}
