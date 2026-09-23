import { Alert, Select, TextInput } from '@shop/ui';

const APPLIANCE_TYPES = ['AC', 'Fridge', 'Oven', 'Other'] as const;

export interface JobApplianceFieldsProps {
  readonly applianceType: string;
  readonly onApplianceTypeChange: (value: string) => void;
  readonly brandChoice: string;
  readonly onBrandChoiceChange: (value: string) => void;
  readonly brandOther: string;
  readonly onBrandOtherChange: (value: string) => void;
  /** P16-2 — live, active brand names (useActiveBrands.ts). "Other" is always appended, never fetched. */
  readonly brandOptions: readonly string[];
  /** Set when the brand list failed to load — shown inline; the picker still works via "Other". */
  readonly brandsError?: string | null;
}

/**
 * P15-4 — Appliance type + Brand (+ "Brand (other)" free text), extracted
 * out of JobCreateForm.tsx (already at the project's 300-line convention
 * ceiling before this task, per P15-3's own flagged debt on
 * job.repository.ts) so the intake form doesn't grow past it. No
 * behaviour change from what JobCreateForm.tsx rendered inline before.
 *
 * P16-2 — the brand list is no longer a hardcoded constant; it's fetched
 * by the caller (useActiveBrands.ts) and passed in as `brandOptions`. If
 * it failed to load, `brandsError` is shown but the dropdown still works
 * via "Other" — intake is never blocked on this read.
 */
export function JobApplianceFields({
  applianceType,
  onApplianceTypeChange,
  brandChoice,
  onBrandChoiceChange,
  brandOther,
  onBrandOtherChange,
  brandOptions,
  brandsError,
}: JobApplianceFieldsProps): React.JSX.Element {
  return (
    <>
      <Select
        label="Appliance type"
        value={applianceType}
        onChange={(e) => {
          onApplianceTypeChange(e.target.value);
        }}
      >
        <option value="">—</option>
        {APPLIANCE_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Select>

      <Select
        label="Brand"
        required
        value={brandChoice}
        onChange={(e) => {
          onBrandChoiceChange(e.target.value);
        }}
      >
        <option value="">—</option>
        {brandOptions.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
        <option value="Other">Other</option>
      </Select>
      {brandsError && (
        <Alert variant="danger">Brand list unavailable ({brandsError}) — use "Other" below.</Alert>
      )}

      {brandChoice === 'Other' && (
        <TextInput
          label="Brand (other)"
          required
          autoFocus
          value={brandOther}
          onChange={(e) => {
            onBrandOtherChange(e.target.value);
          }}
        />
      )}
    </>
  );
}
