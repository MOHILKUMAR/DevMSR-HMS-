-- CreateEnum
CREATE TYPE "login_step" AS ENUM ('change_password');

-- AlterEnum
ALTER TYPE "login_outcome" ADD VALUE 'challenge_started';

-- AlterEnum
ALTER TYPE "session_end_reason" ADD VALUE 'ended_by_user';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "login_challenges" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "hospital_id" UUID,
    "step" "login_step" NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "login_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "login_challenges_token_hash_key" ON "login_challenges"("token_hash");

-- CreateIndex
CREATE INDEX "login_challenges_user_id_idx" ON "login_challenges"("user_id");

-- AddForeignKey
ALTER TABLE "login_challenges" ADD CONSTRAINT "login_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A challenge is used once: the only change allowed is setting completed_at, once. Rows are kept as
-- a record of sign-ins, so DELETE and TRUNCATE are refused like other history.
CREATE FUNCTION "login_challenges_complete_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."completed_at" IS NULL AND NEW."completed_at" IS NOT NULL
    AND (to_jsonb(NEW) - 'completed_at') = (to_jsonb(OLD) - 'completed_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'UPDATE on login_challenges is not allowed except completing it once'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "login_challenges_complete_only"
  BEFORE UPDATE ON "login_challenges"
  FOR EACH ROW EXECUTE FUNCTION "login_challenges_complete_only"();

CREATE TRIGGER "login_challenges_no_delete"
  BEFORE DELETE ON "login_challenges"
  FOR EACH ROW EXECUTE FUNCTION "reject_change"();

CREATE TRIGGER "login_challenges_no_truncate"
  BEFORE TRUNCATE ON "login_challenges"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();
