import { useEffect, useRef, useState } from 'react';
import type { JobClientDto } from '@shop/contracts';
import { TextInput } from '@shop/ui';
import { ipc } from '../../lib/ipc.js';

const SEARCH_DEBOUNCE_MS = 300;

export interface JobClientPickerProps {
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  /** Set when staff picks an existing job client from the dropdown (or the
   * name+phone dedup check in JobCreateForm auto-matches one). Cleared
   * (back to free-typing) when staff edits the name again. Exposes the
   * FULL record (address/area/landmark included) so JobCreateForm can
   * auto-fill the on-site address group — CustomerPicker's onSelect only
   * ever needed name/phone, this picker's callers need more. */
  readonly selected: JobClientDto | null;
  readonly onSelect: (client: JobClientDto) => void;
  readonly onClearSelection: () => void;
}

/**
 * P15-4 — same search-or-create picker as CustomerPicker.tsx (Phase 14),
 * copied and adapted: calls jobClient:search instead of customer:search
 * (BUG-JOBCLIENT-1 — job intake must search the job_client population,
 * not the Spare Parts ledger). OD-5: dedup disambiguator is name AND
 * phone together, never name alone — every dropdown row shows phone
 * alongside name. Search is name-or-phone (jobClient:search matches
 * both — unlike customer:search, which is name-only); the stronger
 * name+phone exact-match dedup (auto-select, no dropdown click needed)
 * still happens in JobCreateForm once the separate Phone field is also
 * filled in, not here — same split CustomerPicker used.
 */
export function JobClientPicker({
  name,
  onNameChange,
  selected,
  onSelect,
  onClearSelection,
}: JobClientPickerProps): React.JSX.Element {
  const [results, setResults] = useState<readonly JobClientDto[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selected) {
      setOpen(false);
      return;
    }
    if (name.trim().length === 0) {
      setResults([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      ipc.jobClient
        .search({ query: name.trim() })
        .then((rows) => {
          setResults(rows);
          setOpen(true);
        })
        .catch(() => {
          setResults([]);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [name, selected]);

  if (selected) {
    return (
      <div>
        <p className="mb-1 text-sm font-medium text-ink">Client</p>
        <div className="flex items-center justify-between rounded-md border border-line bg-surface-sunken px-3 py-2">
          <div>
            <p className="text-sm font-medium text-ink">{selected.name}</p>
            <p className="text-xs text-ink-faint">{selected.phone ?? 'no phone on file'}</p>
          </div>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            Using existing client
          </span>
        </div>
        <button
          type="button"
          onClick={onClearSelection}
          className="mt-1 text-xs text-ink-faint underline hover:text-ink"
        >
          Not this client? Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <TextInput
        label="Client"
        required
        autoFocus
        placeholder="Search by name or phone, or type a new client's name"
        value={name}
        onChange={(e) => {
          onNameChange(e.target.value);
        }}
        onFocus={() => {
          if (results.length > 0 || name.trim().length > 0) setOpen(true);
        }}
        onBlur={() => {
          // Delay so a click on a dropdown row registers before it unmounts.
          setTimeout(() => {
            setOpen(false);
          }, 150);
        }}
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-line bg-surface shadow-lg">
          {results.map((client) => (
            <button
              key={client.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(client);
              }}
              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-surface-sunken"
            >
              <span className="font-medium text-ink">{client.name}</span>
              <span className="text-xs text-ink-faint">{client.phone ?? 'no phone on file'}</span>
            </button>
          ))}
          {name.trim().length > 0 && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
              }}
              className="w-full border-t border-line px-3 py-2 text-left text-sm text-ink-muted hover:bg-surface-sunken"
            >
              Create new client: “{name.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
