import { useState } from 'react';
import { PageHeader } from '@shop/ui';
import { BackupRestoreCard } from './BackupRestoreCard.js';
import { DiscountPresetsCard } from './DiscountPresetsCard.js';
import { JobSettingsCard } from './JobSettingsCard.js';
import { JobSettingsPage } from './JobSettingsPage.js';
import { ReceiptSettingsCard } from './ReceiptSettingsCard.js';
import { ShopIdentityCard } from './ShopIdentityCard.js';

/**
 * Thin composer — each section lives in its own card component. Split out
 * this way (2026-09-09) to keep the file under the 300-line cap; the old
 * "Discount defaults" (wholesale auto-prefill) card that used to live here
 * was removed in the same session and replaced by DiscountPresetsCard.
 *
 * P16-1 — the 4 original cards are unchanged; a 5th tile (JobSettingsCard)
 * navigates to JobSettingsPage locally (no router in this app — App.tsx's
 * top-level `tab` state is the only navigation mechanism, and Job Settings
 * is a sub-page of Settings, not a new top-level tab).
 */
export function SettingsPage(): React.JSX.Element {
  const [showJobSettings, setShowJobSettings] = useState(false);

  if (showJobSettings) {
    return (
      <JobSettingsPage
        onBack={() => {
          setShowJobSettings(false);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <ShopIdentityCard />
      <DiscountPresetsCard />
      <ReceiptSettingsCard />
      <BackupRestoreCard />
      <JobSettingsCard
        onOpen={() => {
          setShowJobSettings(true);
        }}
      />
    </div>
  );
}
