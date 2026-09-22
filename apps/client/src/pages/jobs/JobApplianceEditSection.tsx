import { useEffect, useState } from 'react';
import type { JobDto } from '@shop/contracts';
import { Button } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';
import { BRAND_OPTIONS, JobApplianceFields } from './JobApplianceFields.js';

export interface JobApplianceEditSectionProps {
  readonly job: JobDto;
  readonly onJobChanged: (updated: JobDto) => void;
}

/** I4/BUG-17 (partial) — Appliance type + Brand, editable via
 * job:updateDetails. Same always-editable + dirty-gated Save/Cancel
 * pattern as DiagnosedFaultSection.tsx (replicated exactly, not
 * invented) — reuses JobApplianceFields.tsx's dropdowns so the edit
 * form offers the exact same options as intake. */
export function JobApplianceEditSection({
  job,
  onJobChanged,
}: JobApplianceEditSectionProps): React.JSX.Element {
  const savedBrandIsOther = job.applianceBrand !== null && !BRAND_IS_KNOWN(job.applianceBrand);
  const [applianceType, setApplianceType] = useState(job.applianceType ?? '');
  const [brandChoice, setBrandChoice] = useState(
    savedBrandIsOther ? 'Other' : (job.applianceBrand ?? ''),
  );
  const [brandOther, setBrandOther] = useState(savedBrandIsOther ? (job.applianceBrand ?? '') : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setApplianceType(job.applianceType ?? '');
    const isOther = job.applianceBrand !== null && !BRAND_IS_KNOWN(job.applianceBrand);
    setBrandChoice(isOther ? 'Other' : (job.applianceBrand ?? ''));
    setBrandOther(isOther ? (job.applianceBrand ?? '') : '');
  }, [job.id, job.applianceType, job.applianceBrand]);

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
    const isOther = job.applianceBrand !== null && !BRAND_IS_KNOWN(job.applianceBrand);
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

/** A saved brand not in JobApplianceFields.tsx's own BRAND_OPTIONS list
 * means it was originally entered via the 'Other' escape hatch and
 * should reopen into that free-text field. */
function BRAND_IS_KNOWN(brand: string): boolean {
  return (BRAND_OPTIONS as readonly string[]).includes(brand);
}
