/**
 * English strings — the only language with real content so far.
 * Flat dot-path keys (`common.cancel`, not nested objects) so a missing
 * key is a compile error against `Key` in index.ts, not a silent `undefined`
 * three levels deep.
 */
export const en = {
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.save': 'Save',
  'common.saving': 'Saving…',
  'common.remove': 'Remove',
  'common.search': 'Search',
  'common.loading': 'Loading…',
  'common.retry': 'Retry',
  'common.dismiss': 'Dismiss',
  'common.close': 'Close',
  'common.none': 'None',
  'common.walkIn': 'Walk-in',
} as const;
