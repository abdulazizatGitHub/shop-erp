import { Check } from 'lucide-react';

export interface ItemStepIndicatorProps {
  readonly currentStep: 1 | 2;
  readonly steps: ReadonlyArray<{ label: string }>;
}

/** Pure presentational two-step progress indicator for AddItemModal (I-7). */
export function ItemStepIndicator({
  currentStep,
  steps,
}: ItemStepIndicatorProps): React.JSX.Element {
  return (
    <div className="flex items-center">
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber < currentStep;
        const isActive = stepNumber === currentStep;
        return (
          <div key={step.label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  isCompleted || isActive
                    ? 'bg-brand text-white'
                    : 'border-2 border-line bg-surface text-ink-faint'
                }`}
              >
                {isCompleted ? <Check size={12} /> : stepNumber}
              </div>
              <span
                className={`text-xs font-medium ${isCompleted || isActive ? 'text-ink' : 'text-ink-faint'}`}
              >
                {step.label}
              </span>
            </div>
            {stepNumber < steps.length && (
              <div className={`mx-2 h-px flex-1 ${isCompleted ? 'bg-brand' : 'bg-line'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
