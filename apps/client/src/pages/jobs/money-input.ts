/**
 * F3 — every money field in this app (job intake, delivery modal, sales
 * screen) relied solely on Money.fromRupees()'s parse-time try/catch for
 * validation; none stripped non-numeric characters on input (confirmed
 * by grepping every price/amount field in apps/client/src/pages/sales/
 * before writing this — no such pattern exists there to copy). This is
 * the shared input sanitizer this task actually needs: digits and at
 * most one decimal point, extra dots dropped, everything else stripped.
 */
export function sanitizeMoneyInput(value: string): string {
  const digitsAndDots = value.replace(/[^0-9.]/g, '');
  const firstDot = digitsAndDots.indexOf('.');
  if (firstDot === -1) return digitsAndDots;
  return (
    digitsAndDots.slice(0, firstDot + 1) + digitsAndDots.slice(firstDot + 1).replace(/\./g, '')
  );
}
