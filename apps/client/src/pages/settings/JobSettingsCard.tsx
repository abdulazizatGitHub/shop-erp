import { Button, Card } from '@shop/ui';

export interface JobSettingsCardProps {
  readonly onOpen: () => void;
}

/** P16-1 — the tile SettingsPage.tsx uses to reach JobSettingsPage.tsx (Service Charges / Brands / Commission Approvals). */
export function JobSettingsCard({ onOpen }: JobSettingsCardProps): React.JSX.Element {
  return (
    <Card title="Job settings">
      <p className="mb-4 text-sm text-ink-muted">
        Manage service charges, appliance brands, and commission approvals for the jobs module.
      </p>
      <Button variant="primary" onClick={onOpen}>
        Open Job Settings
      </Button>
    </Card>
  );
}
