import type { CustomerBalanceRowResult } from './customer-balance-import.js';
import type { ItemImportRowResult } from './item-import.js';
import type { OpeningStockRowResult } from './opening-stock-import.js';
import type { SupplierBalanceRowResult } from './supplier-balance-import.js';

function csvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function summaryLine(accepted: number, rejected: number, skipped: number): string {
  return `# ${String(accepted)} accepted, ${String(rejected)} rejected, ${String(skipped)} skipped`;
}

/** Pure — text in, text out. Writing it to disk is apps/server's job. */
export function formatItemImportReport(results: readonly ItemImportRowResult[]): string {
  const accepted = results.filter((r) => r.status === 'accepted').length;
  const rejected = results.filter((r) => r.status === 'rejected').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  const lines = ['Row,Status,Item,Reason'];
  for (const r of results) {
    const identifier = r.status === 'accepted' ? r.record.nameEn : '';
    const reason = r.status === 'accepted' ? '' : r.reason;
    lines.push([String(r.rowNumber), r.status, csvField(identifier), csvField(reason)].join(','));
  }

  return [summaryLine(accepted, rejected, skipped), ...lines].join('\n') + '\n';
}

export function formatOpeningStockImportReport(results: readonly OpeningStockRowResult[]): string {
  const accepted = results.filter((r) => r.status === 'accepted').length;
  const rejected = results.filter((r) => r.status === 'rejected').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  const lines = ['Row,Status,Reason'];
  for (const r of results) {
    const reason = r.status === 'accepted' ? '' : r.reason;
    lines.push([String(r.rowNumber), r.status, csvField(reason)].join(','));
  }

  return [summaryLine(accepted, rejected, skipped), ...lines].join('\n') + '\n';
}

export function formatSupplierBalanceImportReport(
  results: readonly SupplierBalanceRowResult[],
): string {
  const accepted = results.filter((r) => r.status === 'accepted').length;
  const rejected = results.filter((r) => r.status === 'rejected').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  const lines = ['Row,Status,Reason'];
  for (const r of results) {
    const reason = r.status === 'accepted' ? '' : r.reason;
    lines.push([String(r.rowNumber), r.status, csvField(reason)].join(','));
  }

  return [summaryLine(accepted, rejected, skipped), ...lines].join('\n') + '\n';
}

export function formatCustomerBalanceImportReport(
  results: readonly CustomerBalanceRowResult[],
): string {
  const accepted = results.filter((r) => r.status === 'accepted').length;
  const rejected = results.filter((r) => r.status === 'rejected').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  const lines = ['Row,Status,Reason'];
  for (const r of results) {
    const reason = r.status === 'accepted' ? '' : r.reason;
    lines.push([String(r.rowNumber), r.status, csvField(reason)].join(','));
  }

  return [summaryLine(accepted, rejected, skipped), ...lines].join('\n') + '\n';
}
