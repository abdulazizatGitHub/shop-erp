import { z } from 'zod';

/**
 * PHASE_7.md §5 Finding-c — all 5 statuses the live `attendance.status`
 * column supports, not just present/half_day/absent. z.enum (not a TS
 * `enum`) per docs/CODING_STANDARDS.md §1.
 */
export const AttendanceStatus = z.enum(['present', 'half_day', 'absent', 'leave', 'holiday']);
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One staff member's attendance for one day, as sent by the client.
 * wageRatePaisa is a snapshot the client already has (from staff:listStaff)
 * — the handler does not re-fetch it, same reasoning deliverJob accepts
 * price snapshots rather than re-querying inside the service.
 * businessUnitId is NEVER part of this input — PHASE_7.md Correction C
 * derives it server-side from staffRole, never from client input.
 */
export const SaveAttendanceRowInput = z.object({
  staffId: z.string().uuid(),
  date: z.string().regex(DATE_REGEX),
  status: AttendanceStatus,
  wageRatePaisa: z.number().int().nonnegative(),
  staffRole: z.enum(['technician', 'salesman', 'helper']).nullable(),
});
export type SaveAttendanceRowInput = z.infer<typeof SaveAttendanceRowInput>;

/**
 * tenantId is deliberately NOT a field here, unlike the original P7-1
 * brief's draft schema — every other write handler in this codebase
 * (staff.handler.ts, job-delivery.handler.ts, ...) takes tenantId from
 * server-side handler deps, never from renderer-supplied input
 * (CLAUDE.md §3.5 — tenant_id is a constant today; accepting it from the
 * untrusted renderer would be a new, unnecessary trust boundary crossing).
 */
export const SaveAttendanceInput = z.object({
  rows: z.array(SaveAttendanceRowInput).min(1),
});
export type SaveAttendanceInput = z.infer<typeof SaveAttendanceInput>;

/** Same tenantId reasoning as SaveAttendanceInput above. */
export const GetMonthAttendanceInput = z.object({
  year: z.number().int().min(2024).max(2099),
  month: z.number().int().min(1).max(12),
});
export type GetMonthAttendanceInput = z.infer<typeof GetMonthAttendanceInput>;

export const AttendanceRecordDto = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  attendanceDate: z.string(),
  status: AttendanceStatus,
  wageEarnedPaisa: z.number().int(),
  businessUnitId: z.string().uuid(),
});
export type AttendanceRecordDto = z.infer<typeof AttendanceRecordDto>;
