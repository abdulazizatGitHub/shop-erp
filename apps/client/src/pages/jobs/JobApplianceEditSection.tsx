import { useEffect, useState } from 'react';
import type { JobDto } from '@shop/contracts';
import { Button } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { JobApplianceFields } from './JobApplianceFields.js';
import { useActiveBrands } from './useActiveBrands.js';

export interface JobApplianceEditSectionProps {
  readonly job: JobDto;
  readonly onJobChanged: (updated: JobDto) => void;
}

/**
 * I4/BUG-17 (partial) — Appliance type + Brand, editable via
 * job:updateDetails. Same always-editable + dirty-gated Save/Cancel
 * pattern as DiagnosedFaultSection.tsx (replicated exactly, not
 * invented) — reuses JobApplianceFields.tsx's dropdowns so the edit
 * form offers the exact same options as intake.
 *
 * P16-2 — "known" is now checked against the live active-brand list, not
 * the old hardcoded BRAND_OPTIONS. A stored brand that's since been
 * deactivated, deleted, or was always a genuine "Other" free-text value
 * all fall into the same bucket here on purpose: reopen as "Other" with
 * the exact stored text pre-filled. That's not a display bug — it's what
 * makes an untouched Save a no-op (OD-16-6: an existing job's stored
 * text is unaffected by later brand changes), since the free-text field
 * starts exactly equal to job.applianceBrand and isDirty only flips true
 * if the user actually edits it.
 */
export function JobApplianceEditSection({
  job,
  onJobChanged,
}: JobApplianceEditSectionProps): React.JSX.Element {
  const { brands: brandOptions, error: brandsError } = useActiveBrands();
  const brandIsKnown = (brand: string): boolean => brandOptions.includes(brand);
  const savedBrandIsOther = job.applianceBrand !== null && !brandIsKnown(job.applianceBrand);
  const [applianceType, setApplianceType] = useState(job.applianceType ?? '');
  const [brandChoice, setBrandChoice] = useState(
    savedBrandIsOther ? 'Other' : (job.applianceBrand ?? ''),
  );
  const [brandOther, setBrandOther] = useState(savedBrandIsOther ? (job.applianceBrand ?? '') : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setApplianceType(job.applianceType ?? '');
    const isOther = job.applianceBrand !== null && !brandIsKnown(job.applianceBrand);
    setBrandChoice(isOther ? 'Other' : (job.applianceBrand ?? ''));
    setBrandOther(isOther ? (job.applianceBrand ?? '') : '');
  }, [job.id, job.applianceType, job.applianceBrand, brandOptions]);

  const isEditable = job.status !== 'delivered' && job.status !== 'cancelled';
  const brand = brandChoice === 'Other' ? brandOther : brandChoice;
  const isDirty =
    applianceType !== (job.applianceType ?? '') || brand !== (job.applianceBrand ?? '');

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const updated = await ipc.job.updateDetails({
        jobId: job.id,
        applianceType: applianceType.length > 0 ? applianceType : null,
        applianceBrand: brand.trim().length > 0 ? brand.trim() : null,
      });
      onJobChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save appliance details');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel(): void {
    setApplianceType(job.applianceType ?? '');
    const isOther = job.applianceBrand !== null && !brandIsKnown(job.applianceBrand);
    setBrandChoice(isOther ? 'Other' : (job.applianceBrand ?? ''));
    setBrandOther(isOther ? (job.applianceBrand ?? '') : '');
    setError(null);
  }

  if (!isEditable) {
    return (
      <section>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Appliance
        </p>
        <p className="text-sm text-gray-700">
          {job.applianceType ?? '—'} · {job.applianceBrand ?? '—'}
        </p>
      </section>
    );
  }

  return (
    <section>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Appliance</p>
      <div className="flex flex-col gap-4">
        <JobApplianceFields
          applianceType={applianceType}
          onApplianceTypeChange={setApplianceType}
          brandChoice={brandChoice}
          onBrandChoiceChange={setBrandChoice}
          brandOther={brandOther}
          onBrandOtherChange={setBrandOther}
          brandOptions={brandOptions}
          brandsError={brandsError}
        />
      </div>
      {isDirty && (
        <div className="mt-2 flex items-center gap-3">
          <Button
            variant="primary"
            disabled={saving}
            onClick={() => {
              void handleSave();
            }}
          >
            Save
          </Button>
          <button
            type="button"
            className="text-xs text-gray-400 underline hover:text-gray-600"
            onClick={handleCancel}
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </section>
  );
}
