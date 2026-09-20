import { MoneyDisplay } from '@shop/ui';

export interface DeliveryTotalsProps {
  readonly partsTotalPaisa: number;
  readonly labourTotalPaisa: number;
  readonly grandTotalPaisa: number;
}

/** F3 — split out of JobDeliveryModal.tsx (298 lines, close to the
 * 300-line convention with more of this task still to land) purely for
 * headroom, same markup/behaviour. */
export function DeliveryTotals({
  partsTotalPaisa,
  labourTotalPaisa,
  grandTotalPaisa,
}: DeliveryTotalsProps): React.JSX.Element {
  return (
    <section className="flex flex-col gap-1 border-t border-gray-200 pt-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">Parts total</span>
        <MoneyDisplay paisaValue={partsTotalPaisa} size="sm" />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">Labour total</span>
        <MoneyDisplay paisaValue={labourTotalPaisa} size="sm" />
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-gray-200 pt-1">
        <span className="text-base font-bold text-gray-900">Total due</span>
        <MoneyDisplay paisaValue={grandTotalPaisa} size="total" />
      </div>
    </section>
  );
}
