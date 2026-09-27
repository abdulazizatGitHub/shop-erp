import type { CloseSessionInput, OpenSessionInput } from '@shop/contracts';
import type {
  CashSessionRecord,
  CashSessionRepositoryPort,
} from './cash-session.repository.port.js';

/** Pure orchestration, no SQL — same thin-wrapper pattern as expense.service.ts. */
export async function openSession(
  repo: CashSessionRepositoryPort,
  input: OpenSessionInput,
): Promise<CashSessionRecord> {
  return repo.openSession({ date: input.date, openingCashPaisa: input.openingCash });
}

export async function closeSession(
  repo: CashSessionRepositoryPort,
  input: CloseSessionInput,
): Promise<CashSessionRecord> {
  return repo.closeSession({
    sessionId: input.sessionId,
    countedCashPaisa: input.countedCash,
  });
}

/**
 * Phase 17.5, review round 4 R8 — renamed from `getTodaySession`
 * (which called `repo.getSessionByDate(todayIso())`): the Dashboard
 * widget must show an older still-open session instead of reporting
 * "no session today," so this now calls `repo.getOpenSession()`
 * directly, with no date parameter at all.
 */
export async function getOpenSession(
  repo: CashSessionRepositoryPort,
): Promise<CashSessionRecord | null> {
  return repo.getOpenSession();
}
