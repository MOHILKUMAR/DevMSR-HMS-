-- AlterEnum
ALTER TYPE "login_outcome" ADD VALUE 'wrong_totp';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "login_step" ADD VALUE 'totp_setup';
ALTER TYPE "login_step" ADD VALUE 'totp_verify';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "totp_last_time_step" INTEGER;

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "hospital_id" UUID,
    "code_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recovery_codes_user_id_code_hash_key" ON "recovery_codes"("user_id", "code_hash");

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A recovery code is used or revoked once and then never changes. Codes are kept, never deleted.
CREATE FUNCTION "recovery_codes_end_once"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."used_at" IS NULL AND OLD."revoked_at" IS NULL
    AND (NEW."used_at" IS NULL) <> (NEW."revoked_at" IS NULL)
    AND (to_jsonb(NEW) - 'used_at' - 'revoked_at') = (to_jsonb(OLD) - 'used_at' - 'revoked_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'UPDATE on recovery_codes is not allowed except using or revoking a code once'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "recovery_codes_end_once"
  BEFORE UPDATE ON "recovery_codes"
  FOR EACH ROW EXECUTE FUNCTION "recovery_codes_end_once"();

CREATE TRIGGER "recovery_codes_no_delete"
  BEFORE DELETE ON "recovery_codes"
  FOR EACH ROW EXECUTE FUNCTION "reject_change"();

CREATE TRIGGER "recovery_codes_no_truncate"
  BEFORE TRUNCATE ON "recovery_codes"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();
