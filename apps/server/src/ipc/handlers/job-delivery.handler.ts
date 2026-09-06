import { ipcMain } from 'electron';
import { DeliverJobInput, type DeliverJobResult } from '@shop/contracts';
import { computeCommission, deliverJob } from '@shop/core';
import {
  createKyselyDb,
  getLabourTotalPaisa,
  KyselyCommissionRepository,
  KyselyJobDeliveryRepository,
  KyselyJobRepository,
  KyselyPartyRepository,
  openDatabase,
} from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface JobDeliveryHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * PHASE_7.md P7-6/GAP-10 — commission is recorded AFTER deliverJob()
 * commits, in its own separate transaction, never inside the delivery
 * transaction. A commission failure must never roll back or fail the
 * delivery itself — caught and logged by the caller, never rethrown
 * from here.
 */
async function recordCommissionIfEligible(
  deps: JobDeliveryHandlerDeps,
  jobId: string,
  saleId: string,
): Promise<void> {
  const db = openDatabase(deps.dbPath);
  try {
    const kysely = createKyselyDb(db);

    const jobRepo = new KyselyJobRepository(kysely, deps.tenantId, deps.deviceCode);
    const job = await jobRepo.getJob(jobId);
    if (!job?.assignedTo) return; // no technician assigned — nothing to commission

    const partyRepo = new KyselyPartyRepository(kysely, deps.tenantId, deps.deviceCode);
    const technician = await partyRepo.getStaffById(job.assignedTo);
    if (!technician || technician.commissionBp <= 0) return;

    const labourTotalPaisa = await getLabourTotalPaisa(kysely, deps.tenantId, saleId);
    if (labourTotalPaisa <= 0) return;

    const commissionPaisa = computeCommission(labourTotalPaisa, technician.commissionBp);
    if (commissionPaisa <= 0) return;

    const commissionRepo = new KyselyCommissionRepository(kysely, deps.tenantId, deps.deviceCode);
    await commissionRepo.recordCommission({
      technicianId: technician.id,
      jobId,
      commissionPaisa,
      deliveryDate: todayIso(),
    });
  } finally {
    db.close();
  }
}

/** See job.handler.ts's file header — no requirePermission() (PROJECT.md BUG-ADR9). */
export function registerJobDeliveryHandlers(deps: JobDeliveryHandlerDeps): void {
  ipcMain.handle(
    channels.job.deliver,
    withError(async (_event, raw: unknown): Promise<DeliverJobResult> => {
      const input = DeliverJobInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      let result: DeliverJobResult;
      try {
        const repo = new KyselyJobDeliveryRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        result = await deliverJob(repo, input);
      } finally {
        db.close();
      }

      try {
        await recordCommissionIfEligible(deps, input.jobId, result.id);
      } catch (error) {
        // Never let a commission failure fail or roll back a delivery
        // that already committed successfully — log and continue.
        console.error('Failed to record commission for delivered job', input.jobId, error);
      }

      return result;
    }),
  );
}
