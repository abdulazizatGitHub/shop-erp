import type { ReactNode } from 'react';

export interface SettingsSectionFrameProps {
  readonly title: string;
  readonly description: string;
  /** Drops the form max-width cap — the Service Charges table needs the full content width. */
  readonly wide?: boolean;
  readonly children: ReactNode;
}

/** P16-1b — section title + one-line description + the section's own content (including its own bottom Save bar, if it has a form). */
export function SettingsSectionFrame({
  title,
  description,
  wide = false,
  children,
}: SettingsSectionFrameProps): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="border-b border-line px-6 py-5">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{description}</p>
      </div>
      <div className={`flex-1 px-6 py-5 ${wide ? '' : 'max-w-2xl'}`}>{children}</div>
    </div>
  );
}
