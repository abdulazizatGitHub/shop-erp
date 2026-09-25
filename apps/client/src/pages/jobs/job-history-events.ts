import { Qty } from '@shop/shared';
import type { JobDto, JobStatusHistoryDto, TechnicianAssignmentDto } from '@shop/contracts';
import type { JobPartRecord } from '../../types/electron-api.js';
import { CANCELLATION_REASON_LABELS } from './cancellation-reason-labels.js';
import { STATUS_LABELS } from './JobDetailHeader.js';

export interface HistoryEvent {
  readonly timestamp: string;
  readonly description: string;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Statuses that get their own dedicated event below, not a generic
 * "Status changed to X" — telling the same transition twice would be
 * redundant, not informative. */
const DEDICATED_EVENT_STATUSES = new Set(['diagnosed', 'cancelled', 'delivered']);

export interface BuildHistoryEventsParams {
  readonly job: JobDto;
  readonly parts: readonly JobPartRecord[];
  readonly statusHistory: readonly JobStatusHistoryDto[];
  readonly technicianAssignments: readonly TechnicianAssignmentDto[];
  readonly technicianNames: Record<string, string>;
}

/**
 * P14-8 — pure, no React: merges job_status_history, job_technician,
 * job_part, and the job's own diagnosedFault/cancellationReason/saleId
 * into one chronological event list. Kept separate from the rendering
 * component so this can be unit-tested directly with fixture data.
 */
export function buildHistoryEvents({
  job,
  parts,
  statusHistory,
  technicianAssignments,
  technicianNames,
}: BuildHistoryEventsParams): HistoryEvent[] {
  const events: HistoryEvent[] = [];

  for (const row of statusHistory) {
    if (row.fromStatus === null) {
      events.push({ timestamp: row.changedAt, description: 'Job received' });
    } else if (!DEDICATED_EVENT_STATUSES.has(row.toStatus)) {
      events.push({
        timestamp: row.changedAt,
        description: `Status changed to ${STATUS_LABELS[row.toStatus]}`,
      });
    }
  }

  if (job.diagnosedFault !== null) {
    const diagnosedRow = [...statusHistory].reverse().find((r) => r.toStatus === 'diagnosed');
    events.push({
      timestamp: diagnosedRow?.changedAt ?? job.updatedAt,
      description: `Diagnosis recorded: ${truncate(job.diagnosedFault, 60)}`,
    });
  }

  if (job.status === 'cancelled') {
    const cancelledRow = [...statusHistory].reverse().find((r) => r.toStatus === 'cancelled');
    const reasonLabel = job.cancellationReason
      ? ((CANCELLATION_REASON_LABELS as Record<string, string>)[job.cancellationReason] ??
        job.cancellationReason)
      : 'Unknown reason';
    events.push({
      timestamp: cancelledRow?.changedAt ?? job.updatedAt,
      description: `Job cancelled — ${reasonLabel}`,
    });
  }

  if (job.status === 'delivered') {
    const deliveredRow = [...statusHistory].reverse().find((r) => r.toStatus === 'delivered');
    events.push({
      timestamp: deliveredRow?.changedAt ?? job.updatedAt,
      description: `Job delivered — Invoice ${job.invoiceDocNo ?? job.docNo}`,
    });
  }

  for (const a of technicianAssignments) {
    const name = technicianNames[a.partyId] ?? '…';
    events.push({ timestamp: a.assignedAt, description: `${name} assigned` });
    if (a.unassignedAt !== null) {
      // P16-3c (OD-16-5) — every removal has a reason now; older rows
      // (from before this column existed) have unassignReason = null,
      // so the description falls back to the plain P14-8 wording.
      const description =
        a.unassignReason !== null
          ? `${name} unassigned — ${a.unassignReason}`
          : `${name} unassigned`;
      events.push({ timestamp: a.unassignedAt, description });
    }
  }

  for (const p of parts) {
    const qty = Qty.format(Qty.of(p.quantityMilli));
    if (p.entryType === 'issue') {
      events.push({ timestamp: p.issuedAt, description: `${qty} × ${p.itemName} issued to job` });
    } else if (p.entryType === 'return') {
      events.push({
        timestamp: p.issuedAt,
        description: `${qty} × ${p.itemName} returned from job`,
      });
    }
  }

  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** "D MMM YYYY, HH:mm" — extends the app's existing en-GB date
 * convention (day numeric, month short, year numeric, used everywhere
 * else in Jobs) with a 24-hour time, since no combined date+time
 * formatter exists anywhere in the app to reuse wholesale. */
export function formatEventTimestamp(iso: string): string {
  const date = new Date(iso);
  const datePart = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
  const timePart = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${datePart}, ${timePart}`;
}
