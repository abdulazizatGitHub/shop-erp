-- =====================================================================
--  ADDENDUM 12 - v_job_split READS THE REAL DELIVERED INVOICE
--  Migration version 12.
-- =====================================================================
--
--  WHY THIS EXISTS
--  0010's v_job_split still read job.labour_charge (a bare mutable
--  column, never populated by any real code path) instead of the actual
--  delivery invoice. Flagged as a known, deliberate gap in
--  docs/phases/PHASE_6.md §8 from the previous session, planned to be
--  fixed once P6-5 (job delivery) defined what a job's sale_line rows
--  actually look like. P6-5 is now built — this migration is that fix.
--
--  A job with no delivery yet (no confirmed sale linked via
--  sale.job_id) shows zero for every money figure — correct: there is
--  nothing billed yet to report. job.bill_to_party_id/revenue_type
--  remain the intake-time default/estimate (unchanged, per GAP-3's
--  original resolution); this view now reports the ACTUAL billed
--  numbers once a delivery exists, not an estimate.
--
--  KNOWN, DELIBERATE ROUNDING DIVERGENCE (do not "fix" this):
--  parts_charged_paisa sums sale_line.line_total directly — the value
--  already computed and stored by application code via
--  Money.multiplyByQuantity, which ROUNDS half-up (packages/shared/src/
--  money.ts). parts_cost_paisa, by contrast, is computed fresh here in
--  SQL as `unit_cost * quantity / 1000` — and SQLite's `/` on two
--  INTEGER operands TRUNCATES, it does not round. On a fractional
--  quantity these two methods can differ by 1 paisa (e.g. 3.05 kg @
--  Rs 6.50/kg: 650 * 3050 = 1,982,500 -> SQL truncation gives 1982,
--  round-half-up would give 1983). This is NOT a bug and must not be
--  "fixed" by changing the view's division to round — that would
--  silently change v_unit_pl and v_unit_revenue too, which use the
--  identical `unit_cost * quantity / 1000` pattern already (0002/0003),
--  and neither of those has ever rounded. The 1-paisa divergence is an
--  accepted, pre-existing characteristic of this codebase's cost
--  reporting, confirmed against v_unit_pl's own long-standing behavior,
--  not introduced by this migration.
--
--  Table count: unchanged at 44 (0010 added job_accessory; this
--  migration adds no new table). View count: unchanged at 11 (drops and
--  recreates v_job_split, net zero). migration-runner.test.ts's
--  hardcoded counts need NO change — confirmed by re-running it after
--  applying this migration, not assumed.
--
--  No BEGIN/COMMIT here: packages/db/src/migration-runner.ts already
--  wraps db.exec(migration.sql) in its own db.transaction() closure.
-- =====================================================================

DROP VIEW IF EXISTS v_job_split;
CREATE VIEW v_job_split AS
SELECT  j.tenant_id,
        j.id                                                    AS job_id,
        j.doc_no,
        j.received_date,
        j.job_type,
        j.revenue_type,
        j.status,
        p.name                                                  AS customer_name,
        bp.name                                                 AS billed_to_name,
        t.name                                                  AS technician_name,
        COALESCE(lines.parts_charged, 0)                        AS parts_charged_paisa,
        COALESCE(lines.parts_cost, 0)                           AS parts_cost_paisa,
        COALESCE(lines.parts_charged, 0) - COALESCE(lines.parts_cost, 0)
                                                                AS parts_margin_paisa,
        COALESCE(lines.labour_charge, 0)                        AS labour_charge_paisa,
        COALESCE(lines.parts_charged, 0) + COALESCE(lines.labour_charge, 0)
                                                                AS total_bill_paisa
FROM        job j
LEFT JOIN   party p  ON p.id  = j.customer_id
LEFT JOIN   party bp ON bp.id = j.bill_to_party_id
LEFT JOIN   party t  ON t.id  = j.assigned_to
LEFT JOIN (
        SELECT  s.job_id,
                SUM(CASE WHEN sl.line_kind = 'part'   THEN sl.line_total ELSE 0 END) AS parts_charged,
                SUM(CASE WHEN sl.line_kind = 'part'
                         THEN COALESCE(sl.unit_cost, 0) * sl.quantity / 1000 ELSE 0 END) AS parts_cost,
                SUM(CASE WHEN sl.line_kind = 'labour' THEN sl.line_total ELSE 0 END) AS labour_charge
        FROM    sale_line sl
        JOIN    sale s ON s.id = sl.sale_id
        WHERE   s.job_id IS NOT NULL AND s.status = 'confirmed'
        GROUP BY s.job_id
) lines ON lines.job_id = j.id;
