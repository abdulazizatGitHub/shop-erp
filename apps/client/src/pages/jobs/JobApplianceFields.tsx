import { Select, TextInput } from '@shop/ui';

const APPLIANCE_TYPES = ['AC', 'Fridge', 'Oven', 'Other'] as const;

/**
 * V1 — the `brand` table (0001_init.sql) exists but has zero seeded rows
 * anywhere in the codebase (confirmed by grep across every migration and
 * bootstrap.ts before writing this) and no IPC channel exposes it yet —
 * a hardcoded fallback list per this task's own instructions, not a new
 * job:listBrands read against an empty table. "Other" always reveals a
 * free-text input so no real brand is ever blocked.
 */
export const BRAND_OPTIONS = [
  'Dawlance',
  'Gree',
  'Haier',
  'PEL',
  'Orient',
  'Waves',
  'Samsung',
  'LG',
  'Kenwood',
  'Changhong Ruba',
  'Other',
] as const;

export interface JobApplianceFieldsProps {
  readonly applianceType: string;
  readonly onApplianceTypeChange: (value: string) => void;
  readonly brandChoice: string;
  readonly onBrandChoiceChange: (value: string) => void;
  readonly brandOther: string;
  readonly onBrandOtherChange: (value: string) => void;
}

/**
 * P15-4 — Appliance type + Brand (+ "Brand (other)" free text), extracted
 * out of JobCreateForm.tsx (already at the project's 300-line convention
 * ceiling before this task, per P15-3's own flagged debt on
 * job.repository.ts) so the intake form doesn't grow past it. No
 * behaviour change from what JobCreateForm.tsx rendered inline before.
 */
export function JobApplianceFields({
  applianceType,
  onApplianceTypeChange,
  brandChoice,
  onBrandChoiceChange,
  brandOther,
  onBrandOtherChange,
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
        {BRAND_OPTIONS.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </Select>

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
