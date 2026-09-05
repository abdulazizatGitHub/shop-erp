import { describe, expect, it } from 'vitest';
import type {
  AssignTechnicianInput,
  JobRecord,
  JobRepositoryPort,
  JobSplitRecord,
  JobStatusTransitionInput,
  JobSummaryRecord,
  NewJobInput,
  TechnicianCustodyRecord,
} from './job.repository.port.js';
import { assignTechnician, createJob, transitionJobStatus } from './job.service.js';

/**
 * Minimal in-memory fake — enough to prove job.service.ts's functions
 * are pure pass-throughs to the port, not to re-test the repository's
 * own SQL (that's job.repository.test.ts's job). No `.service.ts` file
 * in this codebase has had its own unit test before; this phase's brief
 * asks for one explicitly.
 */
class FakeJobRepository implements JobRepositoryPort {
  public lastCreateJobInput: NewJobInput | undefined;
  public lastStatusTransitionInput: JobStatusTransitionInput | undefined;
  public lastAssignTechnicianInput: AssignTechnicianInput | undefined;

  private readonly job: JobRecord = {
    id: 'job-1',
    docNo: 'JOB-0001',
    customerId: 'cust-1',
    customerNameAdhoc: null,
    customerPhone: null,
    jobType: 'in_shop',
    applianceType: 'Fridge',
    applianceBrand: null,
    applianceModel: null,
    applianceSerial: null,
    reportedFault: 'Not cooling',
    receivedDate: '2026-09-05',
    promisedDate: null,
    estimateAmountPaisa: null,
    estimateApproved: false,
    assignedTo: null,
    status: 'received',
    businessUnitId: 'bu-repair',
    billToPartyId: null,
    revenueType: 'customer_paid',
    labourChargePaisa: 0,
    saleId: null,
  };

  getJob(): Promise<JobRecord | null> {
    return Promise.resolve(this.job);
  }
  listJobs(): Promise<readonly JobSummaryRecord[]> {
    return Promise.resolve([]);
  }
  getJobSplit(): Promise<JobSplitRecord | null> {
    return Promise.resolve(null);
  }
  getTechnicianCustody(): Promise<readonly TechnicianCustodyRecord[]> {
    return Promise.resolve([]);
  }
  createJob(input: NewJobInput): Promise<JobRecord> {
    this.lastCreateJobInput = input;
    return Promise.resolve(this.job);
  }
  updateJobStatus(input: JobStatusTransitionInput): Promise<JobRecord> {
    this.lastStatusTransitionInput = input;
    return Promise.resolve({ ...this.job, status: input.toStatus });
  }
  assignTechnician(input: AssignTechnicianInput): Promise<JobRecord> {
    this.lastAssignTechnicianInput = input;
    return Promise.resolve({ ...this.job, assignedTo: input.technicianPartyId });
  }
}

describe('createJob', () => {
  it('maps CreateJobInput to NewJobInput field-for-field and returns the repo result', async () => {
    const repo = new FakeJobRepository();

    const result = await createJob(repo, {
      customerId: 'cust-1',
      customerNameAdhoc: null,
      customerPhone: null,
      jobType: 'in_shop',
      applianceType: 'Fridge',
      applianceBrand: null,
      applianceModel: null,
      applianceSerial: null,
      reportedFault: 'Not cooling',
      receivedDate: '2026-09-05',
      promisedDate: null,
      estimateAmountPaisa: null,
      assignedTo: null,
      notes: null,
    });

    expect(repo.lastCreateJobInput).toEqual({
      customerId: 'cust-1',
      customerNameAdhoc: null,
      customerPhone: null,
      jobType: 'in_shop',
      applianceType: 'Fridge',
      applianceBrand: null,
      applianceModel: null,
      applianceSerial: null,
      reportedFault: 'Not cooling',
      receivedDate: '2026-09-05',
      promisedDate: null,
      estimateAmountPaisa: null,
      assignedTo: null,
      notes: null,
    });
    // Result comes straight from the repo — status derived from
    // job_status_history is the repository's concern, not the
    // service's; this proves createJob returns exactly that, docNo
    // included, without re-deriving or mutating anything itself.
    expect(result.docNo).toBe('JOB-0001');
    expect(result.status).toBe('received');
  });
});

describe('transitionJobStatus', () => {
  it('passes jobId/toStatus/note through unchanged', async () => {
    const repo = new FakeJobRepository();

    const result = await transitionJobStatus(repo, {
      jobId: 'job-1',
      toStatus: 'in_progress',
      note: 'Technician started work',
    });

    expect(repo.lastStatusTransitionInput).toEqual({
      jobId: 'job-1',
      toStatus: 'in_progress',
      note: 'Technician started work',
    });
    expect(result.status).toBe('in_progress');
  });
});

describe('assignTechnician', () => {
  it('passes jobId/technicianPartyId through unchanged', async () => {
    const repo = new FakeJobRepository();

    const result = await assignTechnician(repo, {
      jobId: 'job-1',
      technicianPartyId: 'tech-1',
    });

    expect(repo.lastAssignTechnicianInput).toEqual({ jobId: 'job-1', technicianPartyId: 'tech-1' });
    expect(result.assignedTo).toBe('tech-1');
  });
});
