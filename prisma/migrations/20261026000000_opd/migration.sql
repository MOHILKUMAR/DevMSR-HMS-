-- OPD for slice 4: walk-in visits with a daily token, the consultation fee's bill, notes and orders.

-- CreateEnum
CREATE TYPE "opd_visit_status" AS ENUM ('awaiting_payment', 'waiting', 'with_doctor', 'completed', 'cancelled');

-- AlterEnum
ALTER TYPE "number_kind" ADD VALUE 'opd_token';

-- CreateTable
CREATE TABLE "opd_visits" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "service_item_id" UUID NOT NULL,
    "visit_date" DATE NOT NULL,
    "token_number" INTEGER NOT NULL,
    "status" "opd_visit_status" NOT NULL DEFAULT 'awaiting_payment',
    "quoted_fee_paise" BIGINT NOT NULL,
    "fee_invoice_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(3),
    "called_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" UUID,
    "cancel_reason" TEXT,
    "complaints" TEXT,
    "findings" TEXT,
    "diagnosis" TEXT,
    "advice" TEXT,
    "follow_up_date" DATE,
    "admission_advised" BOOLEAN NOT NULL DEFAULT false,
    "notes_updated_at" TIMESTAMPTZ(3),

    CONSTRAINT "opd_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opd_orders" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "ordered_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opd_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opd_visits_hospital_id_visit_date_status_idx" ON "opd_visits"("hospital_id", "visit_date", "status");

-- CreateIndex
CREATE INDEX "opd_visits_hospital_id_doctor_id_visit_date_idx" ON "opd_visits"("hospital_id", "doctor_id", "visit_date");

-- CreateIndex
CREATE INDEX "opd_visits_hospital_id_patient_id_idx" ON "opd_visits"("hospital_id", "patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "opd_visits_hospital_id_id_key" ON "opd_visits"("hospital_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "opd_visits_hospital_id_visit_date_token_number_key" ON "opd_visits"("hospital_id", "visit_date", "token_number");

-- CreateIndex
CREATE INDEX "opd_orders_visit_id_idx" ON "opd_orders"("visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "opd_orders_hospital_id_charge_id_key" ON "opd_orders"("hospital_id", "charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "charges_hospital_id_id_key" ON "charges"("hospital_id", "id");

-- AddForeignKey
ALTER TABLE "opd_visits" ADD CONSTRAINT "opd_visits_hospital_id_patient_id_fkey" FOREIGN KEY ("hospital_id", "patient_id") REFERENCES "patients"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opd_visits" ADD CONSTRAINT "opd_visits_hospital_id_doctor_id_fkey" FOREIGN KEY ("hospital_id", "doctor_id") REFERENCES "doctors"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opd_visits" ADD CONSTRAINT "opd_visits_hospital_id_service_item_id_fkey" FOREIGN KEY ("hospital_id", "service_item_id") REFERENCES "service_items"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opd_visits" ADD CONSTRAINT "opd_visits_hospital_id_fee_invoice_id_fkey" FOREIGN KEY ("hospital_id", "fee_invoice_id") REFERENCES "invoices"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opd_orders" ADD CONSTRAINT "opd_orders_hospital_id_visit_id_fkey" FOREIGN KEY ("hospital_id", "visit_id") REFERENCES "opd_visits"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opd_orders" ADD CONSTRAINT "opd_orders_hospital_id_charge_id_fkey" FOREIGN KEY ("hospital_id", "charge_id") REFERENCES "charges"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- OPD rules (CLAUDE.md section 12 and docs/billing-rules.md). The API follows them; the database
-- refuses anything that would break them, whoever sends it.

-- OPD tokens restart every day, so their counter's period is a date (YYYY-MM-DD).
ALTER TABLE "number_counters" DROP CONSTRAINT "number_counters_period_format";
ALTER TABLE "number_counters" ADD CONSTRAINT "number_counters_period_format" CHECK ("period" ~ '^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$');

-- What each status carries: a paid visit has its fee bill, a called one its time, and so on.
ALTER TABLE "opd_visits" ADD CONSTRAINT "opd_visits_shape"
  CHECK ("token_number" > 0 AND "quoted_fee_paise" >= 0
    AND (("status" = 'awaiting_payment' AND "fee_invoice_id" IS NULL AND "paid_at" IS NULL AND "cancelled_at" IS NULL)
      OR ("status" = 'cancelled' AND "fee_invoice_id" IS NULL AND "cancelled_at" IS NOT NULL AND "cancelled_by_id" IS NOT NULL
        AND char_length(coalesce("cancel_reason", '')) >= 3)
      OR ("status" IN ('waiting', 'with_doctor', 'completed') AND "fee_invoice_id" IS NOT NULL AND "paid_at" IS NOT NULL
        AND "cancelled_at" IS NULL))
    AND ("status" NOT IN ('with_doctor', 'completed') OR "called_at" IS NOT NULL)
    AND (("status" = 'completed') = ("completed_at" IS NOT NULL)));

-- A visit moves forward only: paid into the queue, called in, completed; or cancelled before
-- payment. Notes change only while the patient is with the doctor. A finished visit never changes.
CREATE FUNCTION "opd_visits_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'OPD visits are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW."id", NEW."hospital_id", NEW."patient_id", NEW."doctor_id", NEW."service_item_id", NEW."visit_date",
      NEW."token_number", NEW."quoted_fee_paise", NEW."created_by_id", NEW."created_at")
     IS DISTINCT FROM
     (OLD."id", OLD."hospital_id", OLD."patient_id", OLD."doctor_id", OLD."service_item_id", OLD."visit_date",
      OLD."token_number", OLD."quoted_fee_paise", OLD."created_by_id", OLD."created_at")
    OR OLD."status" IN ('completed', 'cancelled')
    OR NOT (
      (OLD."status" = 'awaiting_payment' AND NEW."status" IN ('waiting', 'cancelled'))
      OR (OLD."status" = 'waiting' AND NEW."status" = 'with_doctor')
      OR (OLD."status" = 'with_doctor' AND NEW."status" IN ('with_doctor', 'completed'))
    )
    OR (OLD."status" <> 'awaiting_payment' AND NEW."fee_invoice_id" IS DISTINCT FROM OLD."fee_invoice_id")
    OR (OLD."status" <> 'with_doctor' AND (NEW."complaints", NEW."findings", NEW."diagnosis", NEW."advice",
        NEW."follow_up_date", NEW."admission_advised") IS DISTINCT FROM (OLD."complaints", OLD."findings", OLD."diagnosis",
        OLD."advice", OLD."follow_up_date", OLD."admission_advised")) THEN
    RAISE EXCEPTION 'An OPD visit only moves forward, and its notes change only while the patient is with the doctor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "opd_visits_forward_only" BEFORE UPDATE OR DELETE ON "opd_visits" FOR EACH ROW EXECUTE FUNCTION "opd_visits_guard"();
CREATE TRIGGER "opd_visits_no_truncate" BEFORE TRUNCATE ON "opd_visits" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

-- The fee bill is an issued bill of the same patient.
CREATE FUNCTION "opd_visits_fee_bill"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."fee_invoice_id" IS NOT NULL AND NEW."fee_invoice_id" IS DISTINCT FROM OLD."fee_invoice_id" AND NOT EXISTS (
    SELECT 1 FROM "invoices" WHERE "id" = NEW."fee_invoice_id" AND "status" = 'issued' AND "patient_id" = NEW."patient_id"
  ) THEN
    RAISE EXCEPTION 'The consultation fee bill must be an issued bill of the same patient' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "opd_visits_fee_bill_checked" BEFORE UPDATE ON "opd_visits" FOR EACH ROW EXECUTE FUNCTION "opd_visits_fee_bill"();

-- Orders are written once, only while the patient is with the doctor, for that patient's charge.
CREATE TRIGGER "opd_orders_append_only" BEFORE UPDATE OR DELETE ON "opd_orders" FOR EACH ROW EXECUTE FUNCTION "append_only"();
CREATE TRIGGER "opd_orders_no_truncate" BEFORE TRUNCATE ON "opd_orders" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

CREATE FUNCTION "opd_orders_checked"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "opd_visits" v JOIN "charges" c ON c."id" = NEW."charge_id"
    WHERE v."id" = NEW."visit_id" AND v."status" = 'with_doctor' AND c."patient_id" = v."patient_id"
  ) THEN
    RAISE EXCEPTION 'Orders are placed only while the patient is with the doctor, for that patient' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "opd_orders_within_visit" BEFORE INSERT ON "opd_orders" FOR EACH ROW EXECUTE FUNCTION "opd_orders_checked"();
