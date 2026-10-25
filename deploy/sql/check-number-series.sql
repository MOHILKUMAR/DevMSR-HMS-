-- Checks every number series (UHIDs, bills, receipts) against its counter: each series starts at 1,
-- has no gaps and no repeats, and its highest number equals the counter's last value
-- (CLAUDE.md section 7, docs/decisions.md "UHIDs come from a locked counter row").
-- Read-only apart from a temporary view. Fails (exit code 3 with ON_ERROR_STOP) if any series is wrong.
-- Used after the load test (tests/load) and by every restore drill (restore-checks.sql).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/sql/check-number-series.sql

CREATE OR REPLACE TEMP VIEW hms_number_series AS
WITH documents AS (
  SELECT hospital_id, 'uhid' AS kind,
         substring(uhid FROM '-([0-9]{4})-[0-9]+$') AS period,
         substring(uhid FROM '([0-9]+)$')::bigint AS n
  FROM patients
  UNION ALL
  SELECT hospital_id, 'invoice', financial_year, substring(number FROM '([0-9]+)$')::bigint
  FROM invoices
  WHERE number IS NOT NULL
  UNION ALL
  SELECT hospital_id, 'receipt', financial_year, substring(number FROM '([0-9]+)$')::bigint
  FROM receipts
),
series AS (
  SELECT hospital_id, kind, period,
         count(*) AS documents,
         count(DISTINCT n) AS distinct_numbers,
         min(n) AS lowest,
         max(n) AS highest
  FROM documents
  GROUP BY hospital_id, kind, period
)
SELECT h.code AS hospital,
       coalesce(s.kind, c.kind::text) AS kind,
       coalesce(s.period, c.period) AS period,
       c.last_value AS counter,
       coalesce(s.documents, 0) AS documents,
       CASE
         WHEN c.last_value IS NULL THEN 'numbers without a counter'
         WHEN s.documents IS NULL THEN 'counter without any numbers'
         WHEN s.distinct_numbers <> s.documents THEN 'repeated numbers'
         WHEN s.lowest <> 1 THEN 'series does not start at 1'
         WHEN s.highest <> s.documents THEN 'gap in the series'
         WHEN s.highest <> c.last_value THEN 'counter does not match the highest number'
         ELSE 'ok'
       END AS status
FROM series s
FULL JOIN number_counters c
  ON c.hospital_id = s.hospital_id AND c.kind::text = s.kind AND c.period = s.period
JOIN hospitals h ON h.id = coalesce(s.hospital_id, c.hospital_id);

SELECT hospital, kind, period, counter, documents, status
FROM hms_number_series
ORDER BY hospital, kind, period;

DO $$
DECLARE
  failed integer;
BEGIN
  SELECT count(*) INTO failed FROM hms_number_series WHERE status <> 'ok';
  IF failed > 0 THEN
    RAISE EXCEPTION 'number series check failed: % series wrong (see the status column)', failed;
  END IF;
  RAISE NOTICE 'number series check passed: every series is gapless, unique and matches its counter';
END
$$;
