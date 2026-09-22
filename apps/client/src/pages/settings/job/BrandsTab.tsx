import { EmptyState } from '@shop/ui';

/** Placeholder — built in P16-2 (docs/phases/PHASE_16.md). */
export function BrandsTab(): React.JSX.Element {
  return (
    <EmptyState
      message="Brand management is coming in P16-2"
      hint="Brands are still added via the appliance brand dropdown's hardcoded list for now."
    />
  );
}
