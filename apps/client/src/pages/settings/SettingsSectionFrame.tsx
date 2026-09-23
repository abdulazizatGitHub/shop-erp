import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export interface SettingsSectionFrameProps {
  readonly title: string;
  readonly description: string;
  /** Drops the form max-width cap — the Service Charges table needs the full content width. */
  readonly wide?: boolean;
  readonly children: ReactNode;
}

const SectionActionsContext = createContext<(node: ReactNode) => void>(() => {
  // no-op default — real value always comes from SettingsSectionFrame's provider
});

/**
 * P16-1b review (FIX-B) — Save belongs in one shared bottom action bar
 * (divider across the full content pane, right-aligned), not under the
 * fields at the form's own max-width edge. A section with a form calls
 * this once with its Save button; SettingsSectionFrame renders it in that
 * bar. A section with no form (Backup, Service Charges' table, the
 * Brands/Commission Approvals placeholders) never calls it, so no bar
 * renders for those routes.
 */
export function useSectionActions(node: ReactNode): void {
  const setActions = useContext(SectionActionsContext);
  useEffect(() => {
    setActions(node);
    return () => {
      setActions(null);
    };
  }, [node, setActions]);
}

/** P16-1b — section title + one-line description + the section's own content, with its Save (if any) in a shared bottom bar. */
export function SettingsSectionFrame({
  title,
  description,
  wide = false,
  children,
}: SettingsSectionFrameProps): React.JSX.Element {
  const [actions, setActions] = useState<ReactNode>(null);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="border-b border-line px-6 py-5">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{description}</p>
      </div>
      <SectionActionsContext.Provider value={setActions}>
        <div className={`flex-1 px-6 py-5 ${wide ? '' : 'max-w-2xl'}`}>{children}</div>
      </SectionActionsContext.Provider>
      {actions && <div className="flex justify-end border-t border-line px-6 py-4">{actions}</div>}
    </div>
  );
}
