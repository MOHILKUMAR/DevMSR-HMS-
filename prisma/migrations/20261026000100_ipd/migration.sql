-- IPD for slice 5: admissions, bed assignments and the room and nursing charges posted each midnight.

-- CreateEnum
CREATE TYPE "admission_status" AS ENUM ('admitted', 'discharged');

-- CreateEnum
CREATE TYPE "payer_type" AS ENUM ('self_pay');

-- CreateEnum
CREATE TYPE "bed_end_reason" AS ENUM ('transfer', 'discharge');

-- CreateEnum
CREATE TYPE "daily_charge_kind" AS ENUM ('room', 'nursing');

-- AlterEnum
ALTER TYPE "number_kind" ADD VALUE 'admission';

-- AlterTable
ALTER TABLE "charges" ALTER COLUMN "posted_by_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "room_categories" ADD COLUMN     "minimum_advance_paise" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "admissions" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "status" "admission_status" NOT NULL DEFAULT 'admitted',
    "payer_type" "payer_type" NOT NULL DEFAULT 'self_pay',
    "doctor_id" UUID NOT NULL,
    "opd_visit_id" UUID,
    "reason" TEXT,
    "admitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "admitted_by_id" UUID NOT NULL,
    "minimum_advance_paise" BIGINT NOT NULL,
    "deposit_held_paise" BIGINT NOT NULL,
    "discharged_at" TIMESTAMPTZ(3),

    CONSTRAINT "admissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bed_assignments" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "admission_id" UUID NOT NULL,
    "bed_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "end_reason" "bed_end_reason",
    "created_by_id" UUID NOT NULL,
    "ended_by_id" UUID,

    CONSTRAINT "bed_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_charges" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "admission_id" UUID NOT NULL,
    "charge_date" DATE NOT NULL,
    "kind" "daily_charge_kind" NOT NULL,
    "charge_id" UUID NOT NULL,
    "bed_id" UUID NOT NULL,
    "room_category_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admissions_hospital_id_status_admitted_at_idx" ON "admissions"("hospital_id", "status", "admitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "admissions_hospital_id_id_key" ON "admissions"("hospital_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "admissions_hospital_id_number_key" ON "admissions"("hospital_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "admissions_one_open_per_patient" ON "admissions"("patient_id") WHERE (status = 'admitted');

-- CreateIndex
CREATE INDEX "bed_assignments_admission_id_started_at_idx" ON "bed_assignments"("admission_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "bed_assignments_one_active_per_bed" ON "bed_assignments"("bed_id") WHERE (ended_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "bed_assignments_one_active_per_admission" ON "bed_assignments"("admission_id") WHERE (ended_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "daily_charges_admission_id_charge_date_kind_key" ON "daily_charges"("admission_id", "charge_date", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "daily_charges_hospital_id_charge_id_key" ON "daily_charges"("hospital_id", "charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "beds_hospital_id_id_key" ON "beds"("hospital_id", "id");

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_hospital_id_patient_id_fkey" FOREIGN KEY ("hospital_id", "patient_id") REFERENCES "patients"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_hospital_id_doctor_id_fkey" FOREIGN KEY ("hospital_id", "doctor_id") REFERENCES "doctors"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_hospital_id_opd_visit_id_fkey" FOREIGN KEY ("hospital_id", "opd_visit_id") REFERENCES "opd_visits"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_assignments" ADD CONSTRAINT "bed_assignments_hospital_id_admission_id_fkey" FOREIGN KEY ("hospital_id", "admission_id") REFERENCES "admissions"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_assignments" ADD CONSTRAINT "bed_assignments_hospital_id_bed_id_fkey" FOREIGN KEY ("hospital_id", "bed_id") REFERENCES "beds"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_charges" ADD CONSTRAINT "daily_charges_hospital_id_admission_id_fkey" FOREIGN KEY ("hospital_id", "admission_id") REFERENCES "admissions"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_charges" ADD CONSTRAINT "daily_charges_hospital_id_charge_id_fkey" FOREIGN KEY ("hospital_id", "charge_id") REFERENCES "charges"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_charges" ADD CONSTRAINT "daily_charges_hospital_id_bed_id_fkey" FOREIGN KEY ("hospital_id", "bed_id") REFERENCES "beds"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_charges" ADD CONSTRAINT "daily_charges_hospital_id_room_category_id_fkey" FOREIGN KEY ("hospital_id", "room_category_id") REFERENCES "room_categories"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- IPD rules (CLAUDE.md sections 7 and 12, docs/billing-rules.md). The API follows them; the database
-- refuses anything that would break them, whoever sends it.

ALTER TABLE "room_categories" ADD CONSTRAINT "room_categories_minimum_advance" CHECK ("minimum_advance_paise" >= 0);

ALTER TABLE "admissions" ADD CONSTRAINT "admissions_shape"
  CHECK ("minimum_advance_paise" >= 0 AND "deposit_held_paise" >= 0
    AND (("status" = 'discharged') = ("discharged_at" IS NOT NULL)));

ALTER TABLE "bed_assignments" ADD CONSTRAINT "bed_assignments_shape"
  CHECK (("ended_at" IS NULL) = ("end_reason" IS NULL) AND ("ended_at" IS NULL) = ("ended_by_id" IS NULL)
    AND ("ended_at" IS NULL OR "ended_at" >= "started_at"));

-- An admission keeps who, when and why. It only moves from admitted to discharged, once.
CREATE FUNCTION "admissions_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Admissions are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW."id", NEW."hospital_id", NEW."patient_id", NEW."number", NEW."financial_year", NEW."payer_type", NEW."doctor_id",
      NEW."opd_visit_id", NEW."reason", NEW."admitted_at", NEW."admitted_by_id", NEW."minimum_advance_paise", NEW."deposit_held_paise")
     IS DISTINCT FROM
     (OLD."id", OLD."hospital_id", OLD."patient_id", OLD."number", OLD."financial_year", OLD."payer_type", OLD."doctor_id",
      OLD."opd_visit_id", OLD."reason", OLD."admitted_at", OLD."admitted_by_id", OLD."minimum_advance_paise", OLD."deposit_held_paise")
    OR OLD."status" <> 'admitted' THEN
    RAISE EXCEPTION 'An admission only changes when the patient is discharged, once' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "admissions_fixed" BEFORE UPDATE OR DELETE ON "admissions" FOR EACH ROW EXECUTE FUNCTION "admissions_guard"();
CREATE TRIGGER "admissions_no_truncate" BEFORE TRUNCATE ON "admissions" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

-- A bed assignment is only ever ended, once. A new one needs a free, active bed and an open admission.
CREATE FUNCTION "bed_assignments_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Bed assignments are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."ended_at" IS NOT NULL OR NEW."ended_at" IS NULL
    OR (NEW."id", NEW."hospital_id", NEW."admission_id", NEW."bed_id", NEW."started_at", NEW."created_by_id")
       IS DISTINCT FROM (OLD."id", OLD."hospital_id", OLD."admission_id", OLD."bed_id", OLD."started_at", OLD."created_by_id") THEN
    RAISE EXCEPTION 'A bed assignment only changes when it ends, once' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "bed_assignments_end_once" BEFORE UPDATE OR DELETE ON "bed_assignments" FOR EACH ROW EXECUTE FUNCTION "bed_assignments_guard"();
CREATE TRIGGER "bed_assignments_no_truncate" BEFORE TRUNCATE ON "bed_assignments" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

CREATE FUNCTION "bed_assignments_into_free_bed"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  bed RECORD;
BEGIN
  SELECT "status", "is_active" INTO bed FROM "beds" WHERE "id" = NEW."bed_id" FOR UPDATE;
  IF NOT FOUND OR NOT bed."is_active" OR bed."status" <> 'free' THEN
    RAISE EXCEPTION 'A patient goes only into a free, active bed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "admissions" WHERE "id" = NEW."admission_id" AND "status" = 'admitted') THEN
    RAISE EXCEPTION 'Only an open admission is given a bed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "bed_assignments_checked" BEFORE INSERT ON "bed_assignments" FOR EACH ROW EXECUTE FUNCTION "bed_assignments_into_free_bed"();

-- A bed is occupied exactly when it has an open assignment: nobody marks an empty bed occupied or an
-- occupied bed free, by hand or by mistake.
CREATE FUNCTION "beds_occupied_matches"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  held BOOLEAN;
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" AND 'occupied' IN (NEW."status", OLD."status") THEN
    held := EXISTS (SELECT 1 FROM "bed_assignments" WHERE "bed_id" = NEW."id" AND "ended_at" IS NULL);
    IF (NEW."status" = 'occupied') <> held THEN
      RAISE EXCEPTION 'A bed is occupied exactly while a patient is assigned to it' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "beds_occupied_checked" BEFORE UPDATE ON "beds" FOR EACH ROW EXECUTE FUNCTION "beds_occupied_matches"();

-- What the midnight job posted is never changed.
CREATE TRIGGER "daily_charges_append_only" BEFORE UPDATE OR DELETE ON "daily_charges" FOR EACH ROW EXECUTE FUNCTION "append_only"();
CREATE TRIGGER "daily_charges_no_truncate" BEFORE TRUNCATE ON "daily_charges" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();
