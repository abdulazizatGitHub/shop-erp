import { TextInput } from '@shop/ui';

export interface JobAddressFieldsProps {
  readonly address: string;
  readonly onAddressChange: (value: string) => void;
  readonly area: string;
  readonly onAreaChange: (value: string) => void;
  readonly landmark: string;
  readonly onLandmarkChange: (value: string) => void;
}

/**
 * P15-4 — OD-4's on-site address group, extracted as its own component
 * so JobCreateForm.tsx (already at the project's 300-line convention
 * ceiling before this task, per P15-3's own flagged debt) doesn't grow
 * past it. Rendered only when job type is 'on_site' — the parent decides
 * visibility, this component is unconditional once mounted. Fields stay
 * editable even after JobCreateForm auto-fills them from a selected
 * client's job_client record (OD-4).
 */
export function JobAddressFields({
  address,
  onAddressChange,
  area,
  onAreaChange,
  landmark,
  onLandmarkChange,
}: JobAddressFieldsProps): React.JSX.Element {
  return (
    // Same grid grid-cols-2 gap-4 pattern AddCustomerModal.tsx already
    // uses for side-by-side fields — Address spans both columns (H2),
    // Area/Landmark sit side by side in the row below.
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <TextInput
          label="Address"
          value={address}
          onChange={(e) => {
            onAddressChange(e.target.value);
          }}
        />
      </div>
      <TextInput
        label="Area"
        placeholder="Neighbourhood / village"
        value={area}
        onChange={(e) => {
          onAreaChange(e.target.value);
        }}
      />
      <TextInput
        label="Landmark"
        placeholder="e.g. next to blue mosque"
        value={landmark}
        onChange={(e) => {
          onLandmarkChange(e.target.value);
        }}
      />
    </div>
  );
}
