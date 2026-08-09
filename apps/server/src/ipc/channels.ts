/**
 * Every IPC channel in the application. The equivalent of a routes file.
 * Adding a channel here and nowhere else will fail to compile — that is intended.
 */
export const channels = {
  sale: {
    create: 'sale:create',
    cancel: 'sale:cancel',
    getById: 'sale:getById',
    listByDate: 'sale:listByDate',
  },
  item: {
    create: 'item:create',
    update: 'item:update',
    search: 'item:search',
    stockOnHand: 'item:stockOnHand',
  },
  party: {
    create: 'party:create',
    search: 'party:search',
    ledger: 'party:ledger',
    balance: 'party:balance',
  },
  purchase: { create: 'purchase:create', cancel: 'purchase:cancel' },
  payment: { receive: 'payment:receive', pay: 'payment:pay' },
  report: {
    dailySales: 'report:dailySales',
    receivables: 'report:receivables',
    stockValuation: 'report:stockValuation',
    cashBook: 'report:cashBook',
  },
  importData: { dryRun: 'import:dryRun', commit: 'import:commit' },
  backup: { now: 'backup:now', restore: 'backup:restore' },
} as const;

export type Channel = typeof channels;
