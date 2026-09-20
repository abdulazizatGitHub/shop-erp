import type { UpdateJobDiagnosisInput as ContractsUpdateJobDiagnosisInput } from '@shop/contracts';
import type { JobDiagnosisRepositoryPort } from './job-diagnosis.repository.port.js';
import type { JobRecord } from './job.repository.port.js';

export async function updateJobDiagnosis(
  repo: JobDiagnosisRepositoryPort,
  input: ContractsUpdateJobDiagnosisInput,
): Promise<JobRecord> {
  return repo.updateJobDiagnosisAndDate(input);
}
