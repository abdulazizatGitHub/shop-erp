import { useState } from 'react';
import { Button, PageHeader, Tabs } from '@shop/ui';
import { BrandsTab } from './job/BrandsTab.js';
import { CommissionApprovalsTab } from './job/CommissionApprovalsTab.js';
import { ServiceChargesTab } from './job/ServiceChargesTab.js';

type JobSettingsTab = 'serviceCharges' | 'brands' | 'commissionApprovals';

const TAB_ITEMS = [
  { key: 'serviceCharges' as const, label: 'Service Charges' },
  { key: 'brands' as const, label: 'Brands' },
  { key: 'commissionApprovals' as const, label: 'Commission Approvals' },
];

export interface JobSettingsPageProps {
  readonly onBack: () => void;
}

/** P16-1/P16-2/P16-3b — reached via SettingsPage.tsx's "Job Settings" tile. */
export function JobSettingsPage({ onBack }: JobSettingsPageProps): React.JSX.Element {
  const [tab, setTab] = useState<JobSettingsTab>('serviceCharges');

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Job Settings"
        actions={
          <Button variant="secondary" onClick={onBack}>
            &larr; Back to Settings
          </Button>
        }
      />
      <Tabs items={TAB_ITEMS} active={tab} onChange={setTab} />
      {tab === 'serviceCharges' && <ServiceChargesTab />}
      {tab === 'brands' && <BrandsTab />}
      {tab === 'commissionApprovals' && <CommissionApprovalsTab />}
    </div>
  );
}
