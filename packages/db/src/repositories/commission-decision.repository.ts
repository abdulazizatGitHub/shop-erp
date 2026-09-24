import { newId } from '@shop/shared';
import {
  assertNonBlankReason,
  validateApprovalRecipients,
  type ApproveClaimInput,
  type ClaimDetail,
  type CommissionDecisionRepositoryPort,
  type DecisionRecipientRecord,
  type DecisionRecord,
  type PendingClaimSummary,
  type RecipientPartyInfo,
  type RejectClaimInput,
  type ReverseDecisionInput,
  type TechnicianHistoryEntry,
} from '@shop/core';
import type { Kysely } from 'kysely';
import { withRetry } from '../retry.js';
import type { Database } from '../kysely-schema.js';

interface LatestDecisionState {
  readonly id: string;
  readonly hasReversal: boolean;
  readonly attemptNo: number;
}

/**
 * OD-16-3a's pending definition, read directly rather than via a SQL
 * view (CLAUDE.md §3.7 — no business logic in SQL): the claim's latest
 * decision (by attempt_no) and whether it has a reversal row. Undefined
 * decisionRow means the claim has never been decided.
 */
async function getLatestDecision(
  trx: Kysely<Database>,
  tenantId: string,
  claimId: string,
): Promise<LatestDecisionState | undefined> {
  const decisionRow = await trx
    .selectFrom('commissionDecision')
    .select(['id', 'attemptNo'])
    .where('tenantId', '=', tenantId)
    .where('claimId', '=', claimId)
    .orderBy('attemptNo', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (!decisionRow) return undefined;

  const reversalRow = await trx
    .selectFrom('commissionDecisionReversal')
    .select('id')
    .where('tenantId', '=', tenantId)
    .where('decisionId', '=', decisionRow.id)
    .executeTakeFirst();

  return {
    id: decisionRow.id,
    attemptNo: decisionRow.attemptNo,
    hasReversal: reversalRow !== undefined,
  };
}

async function assertClaimExists(
  trx: Kysely<Database>,
  tenantId: string,
  claimId: string,
): Promise<void> {
  const row = await trx
    .selectFrom('commissionClaim')
    .select('id')
    .where('tenantId', '=', tenantId)
    .where('id', '=', claimId)
    .executeTakeFirst();
  if (!row) {
    throw new Error(`commission_claim ${claimId} not found`);
  }
}

async function assertClaimPending(
  trx: Kysely<Database>,
  tenantId: string,
  claimId: string,
): Promise<number> {
  const latest = await getLatestDecision(trx, tenantId, claimId);
  if (latest && !latest.hasReversal) {
    throw new Error(
      `commission_claim ${claimId} already has an active decision (attempt ${String(latest.attemptNo)}) — reverse it before deciding again`,
    );
  }
  return (latest?.attemptNo ?? 0) + 1;
}

async function getJobTechnicianPartyIds(
  trx: Kysely<Database>,
  tenantId: string,
  jobId: string,
): Promise<Set<string>> {
  const rows = await trx
    .selectFrom('jobTechnician')
    .select('partyId')
    .where('tenantId', '=', tenantId)
    .where('jobId', '=', jobId)
    .execute();
  return new Set(rows.map((r) => r.partyId));
}

async function getPartyLookup(
  trx: Kysely<Database>,
  tenantId: string,
  partyIds: readonly string[],
): Promise<(partyId: string) => RecipientPartyInfo | undefined> {
  if (partyIds.length === 0) return () => undefined;
  const rows = await trx
    .selectFrom('party')
    .select(['id', 'partyType', 'isActive'])
    .where('tenantId', '=', tenantId)
    .where('id', 'in', [...partyIds])
    .execute();
  const map = new Map<string, RecipientPartyInfo>(
    rows.map((r) => [r.id, { partyType: r.partyType, isActive: r.isActive === 1 }]),
  );
  return (partyId: string) => map.get(partyId);
}

async function getRecipients(
  trx: Kysely<Database>,
  tenantId: string,
  decisionId: string,
): Promise<DecisionRecipientRecord[]> {
  const rows = await trx
    .selectFrom('commissionDecisionRecipient')
    .innerJoin('party', 'party.id', 'commissionDecisionRecipient.technicianPartyId')
    .select([
      'commissionDecisionRecipient.technicianPartyId as technicianPartyId',
      'party.name as technicianName',
      'commissionDecisionRecipient.amountPaisa as amountPaisa',
      'commissionDecisionRecipient.outsideHistoryReason as outsideHistoryReason',
    ])
    .where('commissionDecisionRecipient.tenantId', '=', tenantId)
    .where('commissionDecisionRecipient.decisionId', '=', decisionId)
    .execute();
  return rows;
}

export class KyselyCommissionDecisionRepository implements CommissionDecisionRepositoryPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly tenantId: string,
    private readonly deviceCode: string,
  ) {}

  async listPendingClaims(): Promise<readonly PendingClaimSummary[]> {
    const claims = await this.db
      .selectFrom('commissionClaim')
      .innerJoin('job', 'job.id', 'commissionClaim.jobId')
      .innerJoin('party', 'party.id', 'job.customerId')
      .innerJoin('serviceCharge', 'serviceCharge.id', 'commissionClaim.serviceChargeId')
      .select([
        'commissionClaim.id as claimId',
        'commissionClaim.jobId as jobId',
        'job.docNo as jobDocNo',
        'party.name as customerName',
        'serviceCharge.name as serviceChargeName',
        'commissionClaim.labourAmountPaisa as labourAmountPaisa',
        'commissionClaim.suggestedAmountPaisa as suggestedAmountPaisa',
        'commissionClaim.suggestedRecipientPartyId as suggestedRecipientPartyId',
      ])
      .where('commissionClaim.tenantId', '=', this.tenantId)
      .orderBy('commissionClaim.createdAt', 'asc')
      .execute();

    const pending: PendingClaimSummary[] = [];
    for (const claim of claims) {
      const latest = await getLatestDecision(this.db, this.tenantId, claim.claimId);
      if (latest === undefined || latest.hasReversal) {
        pending.push(claim);
      }
    }
    return pending;
  }

  async getClaimDetail(claimId: string): Promise<ClaimDetail> {
    const claim = await this.db
      .selectFrom('commissionClaim')
      .innerJoin('job', 'job.id', 'commissionClaim.jobId')
      .innerJoin('party', 'party.id', 'job.customerId')
      .innerJoin('serviceCharge', 'serviceCharge.id', 'commissionClaim.serviceChargeId')
      .select([
        'commissionClaim.id as claimId',
        'commissionClaim.jobId as jobId',
        'job.docNo as jobDocNo',
        'party.name as customerName',
        'serviceCharge.name as serviceChargeName',
        'commissionClaim.labourAmountPaisa as labourAmountPaisa',
        'commissionClaim.suggestedAmountPaisa as suggestedAmountPaisa',
        'commissionClaim.suggestedRecipientPartyId as suggestedRecipientPartyId',
      ])
      .where('commissionClaim.tenantId', '=', this.tenantId)
      .where('commissionClaim.id', '=', claimId)
      .executeTakeFirst();
    if (!claim) {
      throw new Error(`commission_claim ${claimId} not found`);
    }

    const technicianHistoryRows = await this.db
      .selectFrom('jobTechnician')
      .innerJoin('party', 'party.id', 'jobTechnician.partyId')
      .select([
        'jobTechnician.partyId as technicianPartyId',
        'party.name as technicianName',
        'jobTechnician.assignedAt as assignedAt',
        'jobTechnician.unassignedAt as unassignedAt',
      ])
      .where('jobTechnician.tenantId', '=', this.tenantId)
      .where('jobTechnician.jobId', '=', claim.jobId)
      .orderBy('jobTechnician.assignedAt', 'asc')
      .execute();
    const technicianHistory: TechnicianHistoryEntry[] = technicianHistoryRows;

    const decisionRows = await this.db
      .selectFrom('commissionDecision')
      .select(['id', 'attemptNo', 'decision', 'reason', 'decidedAt'])
      .where('tenantId', '=', this.tenantId)
      .where('claimId', '=', claimId)
      .orderBy('attemptNo', 'asc')
      .execute();

    const decisions: DecisionRecord[] = [];
    for (const row of decisionRows) {
      const recipients = await getRecipients(this.db, this.tenantId, row.id);
      const reversalRow = await this.db
        .selectFrom('commissionDecisionReversal')
        .select(['reason', 'reversedAt'])
        .where('tenantId', '=', this.tenantId)
        .where('decisionId', '=', row.id)
        .executeTakeFirst();
      decisions.push({
        id: row.id,
        attemptNo: row.attemptNo,
        decision: row.decision as 'approved' | 'rejected',
        reason: row.reason,
        decidedAt: row.decidedAt,
        recipients,
        reversal: reversalRow
          ? { reason: reversalRow.reason, reversedAt: reversalRow.reversedAt }
          : null,
      });
    }

    return { ...claim, technicianHistory, decisions };
  }

  async approveClaim(input: ApproveClaimInput): Promise<DecisionRecord> {
    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        await assertClaimExists(trx, this.tenantId, input.claimId);
        const attemptNo = await assertClaimPending(trx, this.tenantId, input.claimId);

        const jobTechnicianPartyIds = await (async () => {
          const claim = await trx
            .selectFrom('commissionClaim')
            .select('jobId')
            .where('tenantId', '=', this.tenantId)
            .where('id', '=', input.claimId)
            .executeTakeFirstOrThrow();
          return getJobTechnicianPartyIds(trx, this.tenantId, claim.jobId);
        })();

        const partyLookup = await getPartyLookup(
          trx,
          this.tenantId,
          input.recipients.map((r) => r.technicianPartyId),
        );

        validateApprovalRecipients(input.recipients, jobTechnicianPartyIds, partyLookup);

        const decisionId = newId();
        const now = new Date().toISOString();

        await trx
          .insertInto('commissionDecision')
          .values({
            id: decisionId,
            tenantId: this.tenantId,
            claimId: input.claimId,
            attemptNo,
            decision: 'approved',
            reason: null,
            decidedAt: input.decidedAt,
            createdAt: now,
          })
          .execute();

        for (const recipient of input.recipients) {
          await trx
            .insertInto('commissionDecisionRecipient')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              decisionId,
              technicianPartyId: recipient.technicianPartyId,
              amountPaisa: recipient.amountPaisa,
              outsideHistoryReason: recipient.outsideHistoryReason,
            })
            .execute();

          const ledgerId = newId();
          await trx
            .insertInto('partyLedger')
            .values({
              id: ledgerId,
              tenantId: this.tenantId,
              partyId: recipient.technicianPartyId,
              entryDate: input.decidedAt,
              entryType: 'commission',
              amount: -recipient.amountPaisa,
              runningNote: null,
              sourceType: 'commission_decision',
              sourceId: decisionId,
              reversedById: null,
              createdAt: now,
              createdBy: null,
              billReference: null,
              dueDate: null,
              billNotes: null,
            })
            .execute();

          await trx
            .insertInto('auditLog')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              tableName: 'party_ledger',
              recordId: ledgerId,
              action: 'insert',
              changedFields: null,
              oldValues: null,
              userId: null,
              deviceCode: this.deviceCode,
              createdAt: now,
            })
            .execute();

          await trx
            .insertInto('syncOutbox')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              tableName: 'party_ledger',
              recordId: ledgerId,
              operation: 'insert',
              payload: null,
              createdAt: now,
              syncedAt: null,
              syncAttempts: 0,
              lastError: null,
            })
            .execute();
        }

        const recipients = await getRecipients(trx, this.tenantId, decisionId);
        return {
          id: decisionId,
          attemptNo,
          decision: 'approved',
          reason: null,
          decidedAt: input.decidedAt,
          recipients,
          reversal: null,
        };
      }),
    );
  }

  async rejectClaim(input: RejectClaimInput): Promise<DecisionRecord> {
    assertNonBlankReason(input.reason, 'reject reason');

    return withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        await assertClaimExists(trx, this.tenantId, input.claimId);
        const attemptNo = await assertClaimPending(trx, this.tenantId, input.claimId);

        const decisionId = newId();
        const now = new Date().toISOString();

        await trx
          .insertInto('commissionDecision')
          .values({
            id: decisionId,
            tenantId: this.tenantId,
            claimId: input.claimId,
            attemptNo,
            decision: 'rejected',
            reason: input.reason,
            decidedAt: input.decidedAt,
            createdAt: now,
          })
          .execute();

        return {
          id: decisionId,
          attemptNo,
          decision: 'rejected' as const,
          reason: input.reason,
          decidedAt: input.decidedAt,
          recipients: [],
          reversal: null,
        };
      }),
    );
  }

  async reverseDecision(input: ReverseDecisionInput): Promise<void> {
    assertNonBlankReason(input.reason, 'reversal reason');

    await withRetry(() =>
      this.db.transaction().execute(async (trx) => {
        const decision = await trx
          .selectFrom('commissionDecision')
          .select(['id', 'decision'])
          .where('tenantId', '=', this.tenantId)
          .where('id', '=', input.decisionId)
          .executeTakeFirst();
        if (!decision) {
          throw new Error(`commission_decision ${input.decisionId} not found`);
        }

        const existingReversal = await trx
          .selectFrom('commissionDecisionReversal')
          .select('id')
          .where('tenantId', '=', this.tenantId)
          .where('decisionId', '=', input.decisionId)
          .executeTakeFirst();
        if (existingReversal) {
          throw new Error(`commission_decision ${input.decisionId} has already been reversed`);
        }

        const now = new Date().toISOString();

        await trx
          .insertInto('commissionDecisionReversal')
          .values({
            id: newId(),
            tenantId: this.tenantId,
            decisionId: input.decisionId,
            reason: input.reason,
            reversedAt: input.reversedAt,
            createdAt: now,
          })
          .execute();

        if (decision.decision !== 'approved') return; // rejected decision: reversal row only, no ledger rows

        const recipients = await trx
          .selectFrom('commissionDecisionRecipient')
          .select(['technicianPartyId', 'amountPaisa'])
          .where('tenantId', '=', this.tenantId)
          .where('decisionId', '=', input.decisionId)
          .execute();

        for (const recipient of recipients) {
          const ledgerId = newId();
          await trx
            .insertInto('partyLedger')
            .values({
              id: ledgerId,
              tenantId: this.tenantId,
              partyId: recipient.technicianPartyId,
              entryDate: input.reversedAt,
              entryType: 'commission',
              amount: recipient.amountPaisa,
              runningNote: null,
              sourceType: 'commission_decision',
              sourceId: input.decisionId,
              reversedById: null,
              createdAt: now,
              createdBy: null,
              billReference: null,
              dueDate: null,
              billNotes: null,
            })
            .execute();

          await trx
            .insertInto('auditLog')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              tableName: 'party_ledger',
              recordId: ledgerId,
              action: 'insert',
              changedFields: null,
              oldValues: null,
              userId: null,
              deviceCode: this.deviceCode,
              createdAt: now,
            })
            .execute();

          await trx
            .insertInto('syncOutbox')
            .values({
              id: newId(),
              tenantId: this.tenantId,
              tableName: 'party_ledger',
              recordId: ledgerId,
              operation: 'insert',
              payload: null,
              createdAt: now,
              syncedAt: null,
              syncAttempts: 0,
              lastError: null,
            })
            .execute();
        }
      }),
    );
  }
}
