import { contextBridge, ipcRenderer } from 'electron';
import type {
  CancelSaleInput,
  CreateCustomerInput,
  CreateItemInput,
  CreatePaymentInput,
  CreateSaleInput,
  CustomerBalanceDto,
  CustomerDto,
  CustomerSearchInput,
  ItemDto,
  ItemLookups,
  ItemSearchInput,
  PaymentDto,
  SaleResult,
  SaleSearchInput,
  SaleSummaryDto,
} from '@shop/contracts';
import type { SaleRecord } from '@shop/core';
import type { UomConversionOption } from '@shop/db';
import { channels } from './ipc/channels.js';
import type { CreateCustomerResult } from './ipc/handlers/customer.handler.js';
import type { CustomerBalanceImportResult } from './ipc/handlers/customer-balance-import.handler.js';
import type { ImportResult } from './ipc/handlers/import.handler.js';
import type { SupplierBalanceImportResult } from './ipc/handlers/supplier-balance-import.handler.js';

interface CreateItemResult {
  readonly id: string;
  readonly itemCode: string;
}

/**
 * The ONLY renderer-visible surface. Never expose ipcRenderer directly —
 * see docs/DATABASE_RULES.md section 5 and docs/SYSTEM_DESIGN.md section 1.
 */
contextBridge.exposeInMainWorld('api', {
  system: {
    ping: (): Promise<{ tableCount: number }> =>
      ipcRenderer.invoke(channels.system.ping) as Promise<{ tableCount: number }>,
  },
  item: {
    create: (input: CreateItemInput): Promise<CreateItemResult> =>
      ipcRenderer.invoke(channels.item.create, input) as Promise<CreateItemResult>,
    search: (input: ItemSearchInput): Promise<readonly ItemDto[]> =>
      ipcRenderer.invoke(channels.item.search, input) as Promise<readonly ItemDto[]>,
    lookups: (): Promise<ItemLookups> =>
      ipcRenderer.invoke(channels.item.lookups) as Promise<ItemLookups>,
  },
  customer: {
    create: (input: CreateCustomerInput): Promise<CreateCustomerResult> =>
      ipcRenderer.invoke(channels.customer.create, input) as Promise<CreateCustomerResult>,
    search: (input: CustomerSearchInput): Promise<readonly CustomerDto[]> =>
      ipcRenderer.invoke(channels.customer.search, input) as Promise<readonly CustomerDto[]>,
    get: (id: string): Promise<CustomerDto | null> =>
      ipcRenderer.invoke(channels.customer.get, { id }) as Promise<CustomerDto | null>,
    balance: (id: string): Promise<CustomerBalanceDto> =>
      ipcRenderer.invoke(channels.customer.balance, { id }) as Promise<CustomerBalanceDto>,
  },
  sale: {
    create: (input: CreateSaleInput): Promise<SaleResult> =>
      ipcRenderer.invoke(channels.sale.create, input) as Promise<SaleResult>,
    cancel: (input: CancelSaleInput): Promise<void> =>
      ipcRenderer.invoke(channels.sale.cancel, input) as Promise<void>,
    getById: (id: string): Promise<SaleRecord | null> =>
      ipcRenderer.invoke(channels.sale.getById, { id }) as Promise<SaleRecord | null>,
    listByDate: (input: SaleSearchInput): Promise<readonly SaleSummaryDto[]> =>
      ipcRenderer.invoke(channels.sale.listByDate, input) as Promise<readonly SaleSummaryDto[]>,
  },
  payment: {
    receive: (input: CreatePaymentInput): Promise<PaymentDto> =>
      ipcRenderer.invoke(channels.payment.receive, input) as Promise<PaymentDto>,
  },
  uom: {
    listConversions: (): Promise<readonly UomConversionOption[]> =>
      ipcRenderer.invoke(channels.uom.listConversions) as Promise<readonly UomConversionOption[]>,
  },
  importData: {
    dryRun: (): Promise<ImportResult | null> =>
      ipcRenderer.invoke(channels.importData.dryRun) as Promise<ImportResult | null>,
    commit: (): Promise<ImportResult | null> =>
      ipcRenderer.invoke(channels.importData.commit) as Promise<ImportResult | null>,
  },
  importSupplierBalance: {
    dryRun: (): Promise<SupplierBalanceImportResult | null> =>
      ipcRenderer.invoke(
        channels.importData.supplierBalanceDryRun,
      ) as Promise<SupplierBalanceImportResult | null>,
    commit: (): Promise<SupplierBalanceImportResult | null> =>
      ipcRenderer.invoke(
        channels.importData.supplierBalanceCommit,
      ) as Promise<SupplierBalanceImportResult | null>,
  },
  importCustomerBalance: {
    dryRun: (): Promise<CustomerBalanceImportResult | null> =>
      ipcRenderer.invoke(
        channels.importData.customerBalanceDryRun,
      ) as Promise<CustomerBalanceImportResult | null>,
    commit: (): Promise<CustomerBalanceImportResult | null> =>
      ipcRenderer.invoke(
        channels.importData.customerBalanceCommit,
      ) as Promise<CustomerBalanceImportResult | null>,
  },
});
