-- AlterEnum
ALTER TYPE "approval_kind" ADD VALUE 'clearance_dues';

-- AlterTable
ALTER TABLE "approval_requests" ADD COLUMN     "discharge_id" UUID;

-- CreateTable
CREATE TABLE "discharges" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "admission_id" UUID NOT NULL,
    "fit_at" TIMESTAMPTZ(3) NOT NULL,
    "fit_by_id" UUID NOT NULL,
    "fit_note" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "completed_by_id" UUID,

    CONSTRAINT "discharges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discharge_clearances" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "discharge_id" UUID NOT NULL,
    "cleared_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleared_by_id" UUID NOT NULL,
    "due_paise" BIGINT NOT NULL,
    "approval_request_id" UUID,

    CONSTRAINT "discharge_clearances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discharge_summaries" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "discharge_id" UUID NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "course_in_hospital" TEXT NOT NULL,
    "condition_at_discharge" TEXT NOT NULL,
    "medications" TEXT,
    "advice" TEXT,
    "follow_up_date" DATE,
    "drafted_by_id" UUID NOT NULL,
    "drafted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signed_by_id" UUID,
    "signed_at" TIMESTAMPTZ(3),

    CONSTRAINT "discharge_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "discharges_hospital_id_completed_at_idx" ON "discharges"("hospital_id", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "discharges_hospital_id_id_key" ON "discharges"("hospital_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "discharges_hospital_id_admission_id_key" ON "discharges"("hospital_id", "admission_id");

-- CreateIndex
CREATE INDEX "discharge_clearances_discharge_id_cleared_at_idx" ON "discharge_clearances"("discharge_id", "cleared_at");

-- CreateIndex
CREATE UNIQUE INDEX "discharge_clearances_hospital_id_approval_request_id_key" ON "discharge_clearances"("hospital_id", "approval_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "discharge_summaries_hospital_id_id_key" ON "discharge_summaries"("hospital_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "discharge_summaries_hospital_id_discharge_id_key" ON "discharge_summaries"("hospital_id", "discharge_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_one_pending_per_discharge" ON "approval_requests"("kind", "discharge_id") WHERE (status = 'pending' AND discharge_id IS NOT NULL);

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_hospital_id_discharge_id_fkey" FOREIGN KEY ("hospital_id", "discharge_id") REFERENCES "discharges"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharges" ADD CONSTRAINT "discharges_hospital_id_admission_id_fkey" FOREIGN KEY ("hospital_id", "admission_id") REFERENCES "admissions"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_clearances" ADD CONSTRAINT "discharge_clearances_hospital_id_discharge_id_fkey" FOREIGN KEY ("hospital_id", "discharge_id") REFERENCES "discharges"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_clearances" ADD CONSTRAINT "discharge_clearances_hospital_id_approval_request_id_fkey" FOREIGN KEY ("hospital_id", "approval_request_id") REFERENCES "approval_requests"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_summaries" ADD CONSTRAINT "discharge_summaries_hospital_id_discharge_id_fkey" FOREIGN KEY ("hospital_id", "discharge_id") REFERENCES "discharges"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Discharge rules (docs/billing-rules.md, discharge and reports). The API follows them; the database
-- refuses anything that would break them, whoever sends it.

-- A clearance with dues points at its discharge and at nothing else. The new kind is compared as
-- text: a value added to an enum cannot be used in the transaction that adds it.
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_shape";
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_shape"
  CHECK ("amount_paise" > 0 AND char_length("reason") BETWEEN 3 AND 500
    AND (("kind" IN ('discount', 'credit_note') AND "invoice_id" IS NOT NULL AND "receipt_id" IS NULL AND "discharge_id" IS NULL)
      OR ("kind" = 'refund' AND ("invoice_id" IS NULL) <> ("receipt_id" IS NULL) AND "discharge_id" IS NULL)
      OR ("kind" = 'receipt_void' AND "receipt_id" IS NOT NULL AND "invoice_id" IS NULL AND "discharge_id" IS NULL)
      OR ("kind"::text = 'clearance_dues' AND "discharge_id" IS NOT NULL AND "invoice_id" IS NULL AND "receipt_id" IS NULL))
    AND ("result_invoice_id" IS NULL OR ("kind" = 'discount' AND "status" = 'approved')));

-- The discharge a request is for is part of what was asked, so it never changes either.
CREATE OR REPLACE FUNCTION "approval_requests_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Approval requests are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."status" <> 'pending' OR NEW."status" = 'pending'
    OR (NEW."id", NEW."hospital_id", NEW."kind", NEW."patient_id", NEW."invoice_id", NEW."receipt_id", NEW."discharge_id",
        NEW."amount_paise", NEW."reason", NEW."details", NEW."requested_by_id", NEW."requested_at")
       IS DISTINCT FROM
       (OLD."id", OLD."hospital_id", OLD."kind", OLD."patient_id", OLD."invoice_id", OLD."receipt_id", OLD."discharge_id",
        OLD."amount_paise", OLD."reason", OLD."details", OLD."requested_by_id", OLD."requested_at") THEN
    RAISE EXCEPTION 'A request is decided once and never changed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE "discharges" ADD CONSTRAINT "discharges_shape"
  CHECK (("fit_note" IS NULL OR char_length("fit_note") BETWEEN 3 AND 500)
    AND ("completed_at" IS NULL) = ("completed_by_id" IS NULL)
    AND ("completed_at" IS NULL OR "completed_at" >= "fit_at"));

-- The fit mark never changes; completion is written once.
CREATE FUNCTION "discharges_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Discharges are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."completed_at" IS NOT NULL OR NEW."completed_at" IS NULL
    OR (NEW."id", NEW."hospital_id", NEW."admission_id", NEW."fit_at", NEW."fit_by_id", NEW."fit_note")
       IS DISTINCT FROM
       (OLD."id", OLD."hospital_id", OLD."admission_id", OLD."fit_at", OLD."fit_by_id", OLD."fit_note") THEN
    RAISE EXCEPTION 'A discharge only moves forward, once' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "discharges_forward_only" BEFORE UPDATE OR DELETE ON "discharges" FOR EACH ROW EXECUTE FUNCTION "discharges_guard"();
CREATE TRIGGER "discharges_no_truncate" BEFORE TRUNCATE ON "discharges" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

-- Money still due at clearance always has the MD's approval behind it.
ALTER TABLE "discharge_clearances" ADD CONSTRAINT "discharge_clearances_shape"
  CHECK ("due_paise" >= 0 AND ("due_paise" = 0 OR "approval_request_id" IS NOT NULL));

CREATE TRIGGER "discharge_clearances_append_only" BEFORE UPDATE OR DELETE ON "discharge_clearances" FOR EACH ROW EXECUTE FUNCTION "append_only"();
CREATE TRIGGER "discharge_clearances_no_truncate" BEFORE TRUNCATE ON "discharge_clearances" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

-- Whoever signs a summary off did not write it.
ALTER TABLE "discharge_summaries" ADD CONSTRAINT "discharge_summaries_shape"
  CHECK (char_length("diagnosis") BETWEEN 3 AND 2000
    AND char_length("course_in_hospital") BETWEEN 3 AND 4000
    AND char_length("condition_at_discharge") BETWEEN 3 AND 1000
    AND ("medications" IS NULL OR char_length("medications") BETWEEN 1 AND 4000)
    AND ("advice" IS NULL OR char_length("advice") BETWEEN 1 AND 2000)
    AND ("signed_at" IS NULL) = ("signed_by_id" IS NULL)
    AND ("signed_by_id" IS NULL OR "signed_by_id" <> "drafted_by_id")
    AND ("signed_at" IS NULL OR "signed_at" >= "drafted_at"));

-- A draft can be rewritten until it is signed. Signing writes only the signature; after it, nothing changes.
CREATE FUNCTION "discharge_summaries_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Discharge summaries are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."signed_at" IS NOT NULL
    OR (NEW."id", NEW."hospital_id", NEW."discharge_id") IS DISTINCT FROM (OLD."id", OLD."hospital_id", OLD."discharge_id")
    OR (NEW."signed_at" IS NOT NULL
      AND (NEW."diagnosis", NEW."course_in_hospital", NEW."condition_at_discharge", NEW."medications", NEW."advice",
           NEW."follow_up_date", NEW."drafted_by_id", NEW."drafted_at")
          IS DISTINCT FROM
          (OLD."diagnosis", OLD."course_in_hospital", OLD."condition_at_discharge", OLD."medications", OLD."advice",
           OLD."follow_up_date", OLD."drafted_by_id", OLD."drafted_at")) THEN
    RAISE EXCEPTION 'A signed discharge summary never changes' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "discharge_summaries_locked_once_signed" BEFORE UPDATE OR DELETE ON "discharge_summaries" FOR EACH ROW EXECUTE FUNCTION "discharge_summaries_guard"();
CREATE TRIGGER "discharge_summaries_no_truncate" BEFORE TRUNCATE ON "discharge_summaries" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();
