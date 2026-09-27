import { useEffect, useState } from 'react';
import type { RowsPerPage } from '@shop/contracts';
import { Alert, Button } from '@shop/ui';
import { useSetRowsPerPage } from '../../../context/RowsPerPageContext.js';
import { ipc } from '../../../lib/ipc.js';
import { useSettingsDirty } from '../SettingsDirtyContext.js';
import { useSectionActions } from '../SettingsSectionFrame.js';

const CHOICES: readonly RowsPerPage[] = [10, 25, 50];

/**
 * P17-3 (docs/phases/PHASE_17.md §2.5, S17-REP-1, Q17-2). Saves via
 * `setting:setRowsPerPage`, then immediately pushes the new value into
 * RowsPerPageContext (useSetRowsPerPage) so every currently-open report/
 * list table re-renders with it right away — no reload (A17-4).
 */
export function ReportsDisplaySettingsSection(): React.JSX.Element {
  const { setDirty } = useSettingsDirty();
  const setRowsPerPageLive = useSetRowsPerPage();
  const [saved, setSaved] = useState<RowsPerPage | null>(null);
  const [selected, setSelected] = useState<RowsPerPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ipc.setting
      .getRowsPerPage()
      .then((value) => {
        setSaved(value);
        setSelected(value);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load setting');
      });
  }, []);

  const loading = selected === null;
  const dirty = selected !== null && saved !== null && selected !== saved;

  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);

  async function save(): Promise<void> {
    if (selected === null) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await ipc.setting.setRowsPerPage({ value: selected });
      setRowsPerPageLive(selected);
      setSaved(selected);
      setMessage('Rows per page saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rows per page');
    } finally {
      setSaving(false);
    }
  }

  useSectionActions(
    <Button
      variant="primary"
      disabled={loading || saving || !dirty}
      onClick={() => {
        void save();
      }}
    >
      {saving ? 'Saving…' : 'Save'}
    </Button>,
  );

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert variant="danger">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}
      <div>
        <p className="mb-2 text-sm font-medium text-ink-muted">
          Rows shown per page on every report and list table
        </p>
        <div className="grid grid-cols-3 gap-3">
          {CHOICES.map((choice) => (
            <Button
              key={choice}
              variant={selected === choice ? 'primary' : 'secondary'}
              size="large"
              disabled={loading || saving}
              onClick={() => {
                setSelected(choice);
              }}
            >
              {choice}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Applies immediately to every currently-open report and list table — no restart needed.
          Default 10.
        </p>
      </div>
    </div>
  );
}
