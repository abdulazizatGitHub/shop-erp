import type { JobDto } from '@shop/contracts';
import type { JobPartRecord } from '../../types/electron-api.js';

function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

interface HistoryEvent {
  readonly date: string;
  readonly description: string;
}

/** Only what JobDto/JobPartRecord actually carry: the received date and
 * issued-part rows. There is no job_status_history or createdAt exposed
 * to the client (see PROJECT.md), so status-change events are never
 * fabricated here — a gap left visible rather than invented. */
function buildEvents(job: JobDto, parts: readonly JobPartRecord[] | null): readonly HistoryEvent[] {
  const events: HistoryEvent[] = [{ date: formatDate(job.receivedDate), description: 'Received' }];
  const issued = (parts ?? [])
    .filter((p) => p.entryType === 'issue')
    .slice()
    .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
  for (const p of issued) {
    events.push({ date: formatDate(p.issuedAt), description: `Part issued: ${p.itemName}` });
  }
  return events;
}

export interface JobActivitySectionProps {
  readonly job: JobDto;
  readonly parts: readonly JobPartRecord[] | null;
}

/** "History" — a compact inline list, not an elaborate timeline (P6.5
 * Decision 1): no circles, no connecting lines, just date + description
 * per line. */
export function JobActivitySection({ job, parts }: JobActivitySectionProps): React.JSX.Element {
  const events = buildEvents(job, parts);
  return (
    <section>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">History</p>
      <ul className="flex flex-col gap-1.5">
        {events.map((event, index) => (
          <li key={index} className="flex items-baseline gap-2">
            <span className="shrink-0 text-xs text-gray-400">{event.date}</span>
            <span className="text-sm text-gray-600">{event.description}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
