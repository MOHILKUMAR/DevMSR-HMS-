-- Checks a database restored from a backup (docs/runbooks/backup-and-restore.md). Run ONLY on a
-- restored copy: it tries to change protected rows to prove the triggers refuse them.
--   psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -v backup_taken_at=2026-10-25T20:30:00Z -f restore-checks.sql
-- Fails with a non-zero exit code if any check fails.

\if :{?backup_taken_at}
\else
\set backup_taken_at now
\endif

\echo '== 1. Number series: gapless, unique, matching their counters'
\ir check-number-series.sql

\echo '== 2. What the backup holds'
SELECT 'hospitals' AS rows_in, count(*) AS count FROM hospitals
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'patients', count(*) FROM patients
UNION ALL SELECT 'charges', count(*) FROM charges
UNION ALL SELECT 'issued bills', count(*) FROM invoices WHERE number IS NOT NULL
UNION ALL SELECT 'receipts', count(*) FROM receipts
UNION ALL SELECT 'audit events', count(*) FROM audit_events;

SELECT migration_name AS latest_migration
FROM _prisma_migrations
WHERE finished_at IS NOT NULL
ORDER BY finished_at DESC
LIMIT 1;

\echo '== 3. Audit trail'
SELECT max(created_at) AS latest_audit_event,
       round(extract(epoch FROM (:'backup_taken_at'::timestamptz - max(created_at))) / 3600, 1) AS hours_before_backup
FROM audit_events;

DO $$
BEGIN
  -- Every financial change writes an audit event. (Seeded demo patients have none, so patients alone prove nothing.)
  IF NOT EXISTS (SELECT 1 FROM audit_events)
     AND (EXISTS (SELECT 1 FROM invoices WHERE number IS NOT NULL) OR EXISTS (SELECT 1 FROM receipts)) THEN
    RAISE EXCEPTION 'audit check failed: there are issued bills or receipts but no audit events';
  END IF;
  IF EXISTS (SELECT 1 FROM audit_events WHERE created_at > now() + interval '5 minutes') THEN
    RAISE EXCEPTION 'audit check failed: audit events dated in the future (clock or time zone problem)';
  END IF;
  RAISE NOTICE 'audit check passed';
END
$$;

\echo '== 4. Protection triggers are present, enabled, and refuse changes'
DO $$
DECLARE
  expected text[] := ARRAY[
    'audit_events_append_only', 'audit_events_no_truncate',
    'invoices_locked', 'invoices_no_truncate',
    'invoice_lines_append_only', 'receipts_append_only', 'receipts_into_open_shift',
    'receipt_allocations_append_only', 'receipt_allocations_checked',
    'number_counters_step_by_one', 'number_counters_no_truncate',
    'patients_identity_fixed', 'patients_no_delete', 'charges_fixed', 'cash_shifts_close_once'
  ];
  missing text[];
  refused boolean;
BEGIN
  SELECT array_agg(trigger_name) INTO missing
  FROM unnest(expected) AS trigger_name
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger t WHERE t.tgname = trigger_name AND NOT t.tgisinternal AND t.tgenabled <> 'D'
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'trigger check failed: missing or disabled: %', array_to_string(missing, ', ');
  END IF;

  IF EXISTS (SELECT 1 FROM audit_events) THEN
    refused := false;
    BEGIN
      UPDATE audit_events SET action = action WHERE id = (SELECT id FROM audit_events LIMIT 1);
    EXCEPTION WHEN OTHERS THEN
      refused := true;
    END;
    IF NOT refused THEN
      RAISE EXCEPTION 'trigger check failed: an audit event accepted an UPDATE';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM invoices WHERE number IS NOT NULL) THEN
    refused := false;
    BEGIN
      UPDATE invoices SET number = number WHERE id = (SELECT id FROM invoices WHERE number IS NOT NULL LIMIT 1);
    EXCEPTION WHEN OTHERS THEN
      refused := true;
    END;
    IF NOT refused THEN
      RAISE EXCEPTION 'trigger check failed: an issued bill accepted an UPDATE';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM receipts) THEN
    refused := false;
    BEGIN
      DELETE FROM receipts WHERE id = (SELECT id FROM receipts LIMIT 1);
    EXCEPTION WHEN OTHERS THEN
      refused := true;
    END;
    IF NOT refused THEN
      RAISE EXCEPTION 'trigger check failed: a receipt accepted a DELETE';
    END IF;
  END IF;

  RAISE NOTICE 'trigger check passed: % protection triggers present and refusing changes', array_length(expected, 1);
END
$$;

\echo '== All restore checks passed'
