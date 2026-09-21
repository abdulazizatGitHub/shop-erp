// Same active/inactive pill pattern as PaymentMethodToggle.tsx/DateRangeSelector.tsx's presets.
const INACTIVE_TOGGLE_CLASS =
  'rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:border-brand hover:text-brand';
const ACTIVE_TOGGLE_CLASS =
  'rounded-md border border-brand bg-brand px-3 py-1.5 text-sm font-medium text-white transition-colors';

export type JobTypeChoice = 'in_shop' | 'on_site';

export interface JobTypeToggleProps {
  readonly value: JobTypeChoice;
  readonly onChange: (value: JobTypeChoice) => void;
}

/**
 * P15-4/OD-4 — job intake's Job type field: In shop (default) / On-site.
 * Extracted out of JobCreateForm.tsx (already at the 300-line convention
 * ceiling before this task) as its own component, same pattern as
 * PaymentMethodToggle.tsx.
 */
export function JobTypeToggle({ value, onChange }: JobTypeToggleProps): React.JSX.Element {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink-muted">Job type</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            onChange('in_shop');
          }}
          className={value === 'in_shop' ? ACTIVE_TOGGLE_CLASS : INACTIVE_TOGGLE_CLASS}
        >
          In shop
        </button>
        <button
          type="button"
          onClick={() => {
            onChange('on_site');
          }}
          className={value === 'on_site' ? ACTIVE_TOGGLE_CLASS : INACTIVE_TOGGLE_CLASS}
        >
          On-site
        </button>
      </div>
    </div>
  );
}
