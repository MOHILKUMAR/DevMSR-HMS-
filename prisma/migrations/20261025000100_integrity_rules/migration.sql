-- Integrity rules that schema.prisma cannot express. Prisma ignores check constraints and
-- triggers when it diffs, so later migrations leave these in place.

-- Platform users have no hospital. Staff users always have one.
ALTER TABLE "users" ADD CONSTRAINT "users_kind_hospital_check"
  CHECK (("kind" = 'platform') = ("hospital_id" IS NULL));

-- Usernames are compared case-insensitively by storing them lowercase.
ALTER TABLE "users" ADD CONSTRAINT "users_username_lowercase_check"
  CHECK ("username" = lower("username"));

-- Shared trigger function: rejects the operation, whichever database user runs it.
CREATE FUNCTION "reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- Audit events are append-only.
CREATE TRIGGER "audit_events_append_only"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "reject_change"();

CREATE TRIGGER "audit_events_no_truncate"
  BEFORE TRUNCATE ON "audit_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

-- Login history is append-only, so failed attempts cannot be erased.
CREATE TRIGGER "login_events_append_only"
  BEFORE UPDATE OR DELETE ON "login_events"
  FOR EACH ROW EXECUTE FUNCTION "reject_change"();

CREATE TRIGGER "login_events_no_truncate"
  BEFORE TRUNCATE ON "login_events"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

-- Clinical records are never hard deleted.
CREATE TRIGGER "patients_no_delete"
  BEFORE DELETE ON "patients"
  FOR EACH ROW EXECUTE FUNCTION "reject_change"();

CREATE TRIGGER "patients_no_truncate"
  BEFORE TRUNCATE ON "patients"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();
