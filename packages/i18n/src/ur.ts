import type { en } from './en.js';

/**
 * Urdu strings — structure only, per owner decision (Phase 4.5 kickoff,
 * 2026-08-30): every screen routes through t('key') now so a second
 * retrofit is never needed, but writing real Urdu text is its own task,
 * out of scope for a UI-redesign phase. Every value is '' until that
 * task happens; `useTranslation` falls back to English for any '' value.
 */
export const ur: Record<keyof typeof en, string> = {
  'common.cancel': '',
  'common.confirm': '',
  'common.save': '',
  'common.saving': '',
  'common.remove': '',
  'common.search': '',
  'common.loading': '',
  'common.retry': '',
  'common.dismiss': '',
  'common.close': '',
  'common.none': '',
  'common.walkIn': '',
};
