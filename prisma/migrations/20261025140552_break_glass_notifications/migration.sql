-- CreateEnum
CREATE TYPE "notification_kind" AS ENUM ('break_glass_started', 'failed_logins');

-- CreateTable
CREATE TABLE "break_glass_grants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "break_glass_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "hospital_id" UUID,
    "user_id" UUID NOT NULL,
    "kind" "notification_kind" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_alerts" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "hospital_id" UUID,
    "count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "break_glass_grants_session_id_idx" ON "break_glass_grants"("session_id");

-- CreateIndex
CREATE INDEX "break_glass_grants_hospital_id_created_at_idx" ON "break_glass_grants"("hospital_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "security_alerts_kind_hospital_id_created_at_idx" ON "security_alerts"("kind", "hospital_id", "created_at");

-- CreateIndex
CREATE INDEX "login_events_hospital_id_created_at_idx" ON "login_events"("hospital_id", "created_at");

-- AddForeignKey
ALTER TABLE "break_glass_grants" ADD CONSTRAINT "break_glass_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_glass_grants" ADD CONSTRAINT "break_glass_grants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_glass_grants" ADD CONSTRAINT "break_glass_grants_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One open break-glass grant per session at a time.
CREATE UNIQUE INDEX "break_glass_grants_one_open_per_session" ON "break_glass_grants"("session_id") WHERE "ended_at" IS NULL;

-- A grant can only be ended early, once. Its user, hospital, reason and times never change.
CREATE FUNCTION "break_glass_grants_end_once"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."ended_at" IS NULL AND NEW."ended_at" IS NOT NULL
    AND (to_jsonb(NEW) - 'ended_at') = (to_jsonb(OLD) - 'ended_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'UPDATE on break_glass_grants is not allowed except ending it once'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "break_glass_grants_end_once"
  BEFORE UPDATE ON "break_glass_grants"
  FOR EACH ROW EXECUTE FUNCTION "break_glass_grants_end_once"();

CREATE TRIGGER "break_glass_grants_no_delete"
  BEFORE DELETE ON "break_glass_grants"
  FOR EACH ROW EXECUTE FUNCTION "reject_change"();

CREATE TRIGGER "break_glass_grants_no_truncate"
  BEFORE TRUNCATE ON "break_glass_grants"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

-- A notification can only be marked read, once.
CREATE FUNCTION "notifications_read_once"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."read_at" IS NULL AND NEW."read_at" IS NOT NULL
    AND (to_jsonb(NEW) - 'read_at') = (to_jsonb(OLD) - 'read_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'UPDATE on notifications is not allowed except marking it read once'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "notifications_read_once"
  BEFORE UPDATE ON "notifications"
  FOR EACH ROW EXECUTE FUNCTION "notifications_read_once"();

CREATE TRIGGER "notifications_no_delete"
  BEFORE DELETE ON "notifications"
  FOR EACH ROW EXECUTE FUNCTION "reject_change"();

CREATE TRIGGER "notifications_no_truncate"
  BEFORE TRUNCATE ON "notifications"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

-- Alerts are history: append only, like the audit log.
CREATE TRIGGER "security_alerts_append_only"
  BEFORE UPDATE OR DELETE ON "security_alerts"
  FOR EACH ROW EXECUTE FUNCTION "reject_change"();

CREATE TRIGGER "security_alerts_no_truncate"
  BEFORE TRUNCATE ON "security_alerts"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

REVOKE UPDATE ON "security_alerts" FROM hms_api;
