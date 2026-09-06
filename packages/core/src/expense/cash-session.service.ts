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

export async function getTodaySession(
  repo: CashSessionRepositoryPort,
  date: string,
): Promise<CashSessionRecord | null> {
  return repo.getSessionByDate(date);
}
