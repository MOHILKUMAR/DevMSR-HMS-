-- Patient registration: UHIDs from a gapless counter, address, guardian and emergency contact.

-- CreateEnum
CREATE TYPE "guardian_relation" AS ENUM ('son_of', 'daughter_of', 'wife_of', 'husband_of', 'care_of');

-- CreateEnum
CREATE TYPE "number_kind" AS ENUM ('uhid');

-- AlterTable: uhid starts empty so patients registered before this migration can be numbered below.
ALTER TABLE "patients" ADD COLUMN     "address_line" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "date_of_birth_estimated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emergency_contact_name" TEXT,
ADD COLUMN     "emergency_contact_phone" TEXT,
ADD COLUMN     "guardian_name" TEXT,
ADD COLUMN     "guardian_relation" "guardian_relation",
ADD COLUMN     "pincode" CHAR(6),
ADD COLUMN     "state" TEXT,
ADD COLUMN     "uhid" TEXT,
ADD COLUMN     "updated_by_id" UUID;

-- CreateTable
CREATE TABLE "number_counters" (
    "hospital_id" UUID NOT NULL,
    "kind" "number_kind" NOT NULL,
    "period" TEXT NOT NULL,
    "last_value" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "number_counters_pkey" PRIMARY KEY ("hospital_id","kind","period")
);

-- AddForeignKey
ALTER TABLE "number_counters" ADD CONSTRAINT "number_counters_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "number_counters" ADD CONSTRAINT "number_counters_last_value_positive" CHECK ("last_value" > 0);
ALTER TABLE "number_counters" ADD CONSTRAINT "number_counters_period_format" CHECK ("period" ~ '^[0-9]{4}(-[0-9]{2})?$');

-- Patients registered before UHIDs existed get them now, in registration order per hospital and
-- calendar year (IST), and the counters continue from there.
WITH numbered AS (
  SELECT
    p."id",
    p."hospital_id",
    h."code",
    EXTRACT(YEAR FROM p."created_at" AT TIME ZONE 'Asia/Kolkata')::int AS "year",
    row_number() OVER (
      PARTITION BY p."hospital_id", EXTRACT(YEAR FROM p."created_at" AT TIME ZONE 'Asia/Kolkata')
      ORDER BY p."created_at", p."id"
    ) AS "n"
  FROM "patients" p
  JOIN "hospitals" h ON h."id" = p."hospital_id"
)
UPDATE "patients" p
SET "uhid" = numbered."code" || '-' || numbered."year" || '-' ||
  CASE WHEN numbered."n" < 1000000 THEN lpad(numbered."n"::text, 6, '0') ELSE numbered."n"::text END
FROM numbered
WHERE p."id" = numbered."id";

INSERT INTO "number_counters" ("hospital_id", "kind", "period", "last_value")
SELECT
  "hospital_id",
  'uhid',
  EXTRACT(YEAR FROM "created_at" AT TIME ZONE 'Asia/Kolkata')::int::text,
  count(*)
FROM "patients"
GROUP BY "hospital_id", EXTRACT(YEAR FROM "created_at" AT TIME ZONE 'Asia/Kolkata');

ALTER TABLE "patients" ALTER COLUMN "uhid" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "patients_hospital_id_uhid_key" ON "patients"("hospital_id", "uhid");

ALTER TABLE "patients" ADD CONSTRAINT "patients_pincode_format" CHECK ("pincode" ~ '^[1-9][0-9]{5}$');

-- A patient's identity columns never change: id, hospital, UHID, and who registered them when.
CREATE FUNCTION "patients_identity_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."id", NEW."hospital_id", NEW."uhid", NEW."created_at", NEW."created_by_id")
     IS DISTINCT FROM
     (OLD."id", OLD."hospital_id", OLD."uhid", OLD."created_at", OLD."created_by_id") THEN
    RAISE EXCEPTION 'A patient''s UHID, hospital and registration never change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "patients_identity_fixed"
  BEFORE UPDATE ON "patients"
  FOR EACH ROW EXECUTE FUNCTION "patients_identity_guard"();

-- A counter only ever moves up by one, so a number is never handed out twice or skipped.
CREATE FUNCTION "number_counters_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DELETE on number_counters is not allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW."hospital_id", NEW."kind", NEW."period") IS DISTINCT FROM (OLD."hospital_id", OLD."kind", OLD."period")
    OR NEW."last_value" <> OLD."last_value" + 1 THEN
    RAISE EXCEPTION 'A number counter only moves up by one' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "number_counters_step_by_one"
  BEFORE UPDATE OR DELETE ON "number_counters"
  FOR EACH ROW EXECUTE FUNCTION "number_counters_guard"();

CREATE TRIGGER "number_counters_no_truncate"
  BEFORE TRUNCATE ON "number_counters"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();
