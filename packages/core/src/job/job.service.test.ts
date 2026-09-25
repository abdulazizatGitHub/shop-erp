import { describe, expect, it } from 'vitest';
import type { JobTechnicianRepositoryPort } from './job-technician.repository.port.js';
import type {
  AssignTechnicianInput,
  JobRecord,
  JobRepositoryPort,
  JobSplitRecord,
  JobStatusHistoryRecord,
  JobStatusTransitionInput,
  JobSummaryRecord,
  NewJobInput,
  TechnicianCustodyRecord,
} from './job.repository.port.js';
import {
  assignTechnician,
  createJob,
  transitionJobStatus,
  unassignTechnician,
} from './job.service.js';

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
    jobClientId: null,
    jobClientName: null,
    jobClientPhone: null,
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
    invoiceDocNo: null,
    cancellationReason: null,
    diagnosedFault: null,
    updatedAt: '2026-09-05T00:00:00.000Z',
    notes: null,
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
  listStatusHistory(): Promise<readonly JobStatusHistoryRecord[]> {
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

/**
 * Minimal fake for JobTechnicianRepositoryPort — proves
 * unassignTechnician (job.service.ts) is a pure pass-through to
 * repo.unassignTechnician(id, reason), same convention as
 * FakeJobRepository above. The real lock/reason enforcement lives in
 * the repository implementation, tested separately in
 * job-technician.repository.test.ts.
 */
class FakeJobTechnicianRepository implements JobTechnicianRepositoryPort {
  public lastUnassignId: string | undefined;
  public lastUnassignReason: string | undefined;

  listTechnicianAssignments(): ReturnType<
    JobTechnicianRepositoryPort['listTechnicianAssignments']
  > {
    return Promise.resolve([]);
  }
  unassignTechnician(id: string, reason: string): Promise<void> {
    this.lastUnassignId = id;
    this.lastUnassignReason = reason;
    return Promise.resolve();
  }
}

describe('createJob', () => {
  it('maps CreateJobInput to NewJobInput field-for-field and returns the repo result', async () => {
    const repo = new FakeJobRepository();

    const result = await createJob(repo, {
      customerId: 'cust-1',
      customerNameAdhoc: null,
      customerPhone: null,
      jobClientId: 'client-1',
      newClient: null,
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
      jobClientId: 'client-1',
      newClient: null,
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

describe('unassignTechnician (P16-3c)', () => {
  it('passes id/reason through unchanged to repo.unassignTechnician', async () => {
    const repo = new FakeJobTechnicianRepository();

    await unassignTechnician(repo, { id: 'ta-1', reason: 'Technician left the company' });

    expect(repo.lastUnassignId).toBe('ta-1');
    expect(repo.lastUnassignReason).toBe('Technician left the company');
  });
});
