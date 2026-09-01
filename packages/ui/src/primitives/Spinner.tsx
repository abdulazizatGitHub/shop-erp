export interface SpinnerProps {
  readonly size?: 'sm' | 'md';
}

const SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
};

/** A single spinning ring — used inline (a loading table cell) or inside LoadingState. */
export function Spinner({ size = 'md' }: SpinnerProps): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-2 border-line-strong border-t-brand ${SIZE_CLASSES[size]}`}
    />
  );
}
