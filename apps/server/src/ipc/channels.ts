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
    lookups: 'item:lookups',
  },
  party: {
    create: 'party:create',
    search: 'party:search',
    get: 'party:get',
    ledger: 'party:ledger',
    balance: 'party:balance',
  },
  customer: {
    create: 'customer:create',
    search: 'customer:search',
    get: 'customer:get',
    balance: 'customer:balance',
  },
  purchase: {
    create: 'purchase:create',
    cancel: 'purchase:cancel',
    list: 'purchase:list',
    printOrder: 'purchase:printOrder',
  },
  payment: { receive: 'payment:receive', pay: 'payment:pay' },
  uom: { listConversions: 'uom:listConversions' },
  report: {
    dailySales: 'report:dailySales',
    receivables: 'report:receivables',
    stockValuation: 'report:stockValuation',
    cashBook: 'report:cashBook',
    unitPl: 'report:unitPl',
  },
  importData: {
    dryRun: 'import:dryRun',
    commit: 'import:commit',
    supplierBalanceDryRun: 'import:supplierBalance:dryRun',
    supplierBalanceCommit: 'import:supplierBalance:commit',
    customerBalanceDryRun: 'import:customerBalance:dryRun',
    customerBalanceCommit: 'import:customerBalance:commit',
  },
  backup: { now: 'backup:now', restore: 'backup:restore' },
  setting: {
    getReceiptPaperSize: 'setting:getReceiptPaperSize',
    setReceiptPaperSize: 'setting:setReceiptPaperSize',
    getShopName: 'setting:getShopName',
    setShopName: 'setting:setShopName',
  },
  print: { reprintReceipt: 'print:reprintReceipt' },
  invoice: { printSaleInvoice: 'invoice:printSaleInvoice' },
  system: { ping: 'system:ping' },
} as const;

export type Channel = typeof channels;
