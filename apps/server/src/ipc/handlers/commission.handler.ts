import { ipcMain } from 'electron';
import {
  ApproveClaimInput,
  GetClaimDetailInput,
  RejectClaimInput,
  ReverseDecisionInput,
  type ClaimDetailDto,
  type ClaimSummaryDto,
  type DecisionRecordDto,
  type PendingClaimSummaryDto,
} from '@shop/contracts';
import type { ClaimDetail, DecisionRecord } from '@shop/core';
import { createKyselyDb, KyselyCommissionDecisionRepository, openDatabase } from '@shop/db';
import { channels } from '../channels.js';
import { withError } from '../middleware/with-error.js';

export interface CommissionHandlerDeps {
  readonly dbPath: string;
  readonly tenantId: string;
  readonly deviceCode: string;
}

/** Readonly-array port results -> the Zod DTO's (mutable-array) inferred shape. */
function toDecisionRecordDto(record: DecisionRecord): DecisionRecordDto {
  return {
    ...record,
    recipients: [...record.recipients],
  };
}

function toClaimDetailDto(detail: ClaimDetail): ClaimDetailDto {
  return {
    ...detail,
    technicianHistory: [...detail.technicianHistory],
    decisions: detail.decisions.map(toDecisionRecordDto),
  };
}

/**
 * P16-3a Checkpoint 2 (docs/phases/PHASE_16.md §2a, ADR-0015). Thin
 * handlers only — every check (claim existence, pending state, OD-16-12
 * recipient rule, non-blank reasons) lives in
 * commission-decision.repository.ts and the core validators it calls.
 * No requirePermission() (PROJECT.md BUG-ADR9), same as every other
 * handler today.
 */
export function registerCommissionHandlers(deps: CommissionHandlerDeps): void {
  ipcMain.handle(
    channels.commission.listPending,
    withError(async (): Promise<readonly PendingClaimSummaryDto[]> => {
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyCommissionDecisionRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await repo.listPendingClaims();
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.commission.listAll,
    withError(async (): Promise<readonly ClaimSummaryDto[]> => {
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyCommissionDecisionRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return await repo.listAllClaims();
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.commission.getDetail,
    withError(async (_event, raw: unknown): Promise<ClaimDetailDto> => {
      const input = GetClaimDetailInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyCommissionDecisionRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return toClaimDetailDto(await repo.getClaimDetail(input.claimId));
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.commission.approve,
    withError(async (_event, raw: unknown): Promise<DecisionRecordDto> => {
      const input = ApproveClaimInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyCommissionDecisionRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return toDecisionRecordDto(await repo.approveClaim(input));
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.commission.reject,
    withError(async (_event, raw: unknown): Promise<DecisionRecordDto> => {
      const input = RejectClaimInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyCommissionDecisionRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        return toDecisionRecordDto(await repo.rejectClaim(input));
      } finally {
        db.close();
      }
    }),
  );

  ipcMain.handle(
    channels.commission.reverse,
    withError(async (_event, raw: unknown): Promise<void> => {
      const input = ReverseDecisionInput.parse(raw);
      const db = openDatabase(deps.dbPath);
      try {
        const repo = new KyselyCommissionDecisionRepository(
          createKyselyDb(db),
          deps.tenantId,
          deps.deviceCode,
        );
        await repo.reverseDecision(input);
      } finally {
        db.close();
      }
    }),
  );
}
