import { PageHeader } from '@shop/ui';
import { BackupRestoreCard } from './BackupRestoreCard.js';
import { DiscountPresetsCard } from './DiscountPresetsCard.js';
import { ReceiptSettingsCard } from './ReceiptSettingsCard.js';
import { ShopIdentityCard } from './ShopIdentityCard.js';

/**
 * Thin composer — each section lives in its own card component. Split out
 * this way (2026-09-09) to keep the file under the 300-line cap; the old
 * "Discount defaults" (wholesale auto-prefill) card that used to live here
 * was removed in the same session and replaced by DiscountPresetsCard.
 */
export function SettingsPage(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <ShopIdentityCard />
      <DiscountPresetsCard />
      <ReceiptSettingsCard />
      <BackupRestoreCard />
    </div>
  );
}
