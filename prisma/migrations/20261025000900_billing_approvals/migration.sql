-- Approvals for slice 3b: discounts, credit notes, refunds and receipt voids, each decided by a second user.

-- CreateEnum
CREATE TYPE "approval_kind" AS ENUM ('discount', 'credit_note', 'refund', 'receipt_void');

-- CreateEnum
CREATE TYPE "approval_status" AS ENUM ('pending', 'approved', 'rejected');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "number_kind" ADD VALUE 'credit_note';
ALTER TYPE "number_kind" ADD VALUE 'refund';

-- AlterTable
ALTER TABLE "hospitals" ADD COLUMN     "discount_approval_limit_paise" BIGINT NOT NULL DEFAULT 100000;

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "kind" "approval_kind" NOT NULL,
    "status" "approval_status" NOT NULL DEFAULT 'pending',
    "patient_id" UUID NOT NULL,
    "invoice_id" UUID,
    "receipt_id" UUID,
    "amount_paise" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" TEXT,
    "result_invoice_id" UUID,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "approval_request_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "whole_bill" BOOLEAN NOT NULL,
    "taxable_paise" BIGINT NOT NULL,
    "cgst_paise" BIGINT NOT NULL,
    "sgst_paise" BIGINT NOT NULL,
    "round_off_paise" BIGINT NOT NULL,
    "total_paise" BIGINT NOT NULL,
    "approved_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_lines" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "credit_note_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER,
    "taxable_paise" BIGINT NOT NULL,
    "cgst_paise" BIGINT NOT NULL,
    "sgst_paise" BIGINT NOT NULL,
    "total_paise" BIGINT NOT NULL,

    CONSTRAINT "credit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "approval_request_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "shift_id" UUID NOT NULL,
    "receipt_id" UUID,
    "invoice_id" UUID,
    "mode" "payment_mode" NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "reference" TEXT,
    "bank_name" TEXT,
    "paid_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_voids" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "approval_request_id" UUID NOT NULL,
    "voided_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_voids_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_requests_hospital_id_status_requested_at_idx" ON "approval_requests"("hospital_id", "status", "requested_at");

-- CreateIndex
CREATE INDEX "approval_requests_hospital_id_patient_id_idx" ON "approval_requests"("hospital_id", "patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_hospital_id_id_key" ON "approval_requests"("hospital_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_one_pending_per_bill" ON "approval_requests"("kind", "invoice_id") WHERE (status = 'pending' AND invoice_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_one_pending_per_receipt" ON "approval_requests"("kind", "receipt_id") WHERE (status = 'pending' AND receipt_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "credit_notes_invoice_id_idx" ON "credit_notes"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_hospital_id_id_key" ON "credit_notes"("hospital_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_hospital_id_number_key" ON "credit_notes"("hospital_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_hospital_id_approval_request_id_key" ON "credit_notes"("hospital_id", "approval_request_id");

-- CreateIndex
CREATE INDEX "credit_note_lines_invoice_id_line_no_idx" ON "credit_note_lines"("invoice_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "credit_note_lines_credit_note_id_line_no_key" ON "credit_note_lines"("credit_note_id", "line_no");

-- CreateIndex
CREATE INDEX "refunds_hospital_id_patient_id_idx" ON "refunds"("hospital_id", "patient_id");

-- CreateIndex
CREATE INDEX "refunds_shift_id_idx" ON "refunds"("shift_id");

-- CreateIndex
CREATE INDEX "refunds_receipt_id_idx" ON "refunds"("receipt_id");

-- CreateIndex
CREATE INDEX "refunds_invoice_id_idx" ON "refunds"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_hospital_id_id_key" ON "refunds"("hospital_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_hospital_id_number_key" ON "refunds"("hospital_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_hospital_id_approval_request_id_key" ON "refunds"("hospital_id", "approval_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_voids_hospital_id_receipt_id_key" ON "receipt_voids"("hospital_id", "receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_voids_hospital_id_approval_request_id_key" ON "receipt_voids"("hospital_id", "approval_request_id");

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_hospital_id_patient_id_fkey" FOREIGN KEY ("hospital_id", "patient_id") REFERENCES "patients"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_hospital_id_invoice_id_fkey" FOREIGN KEY ("hospital_id", "invoice_id") REFERENCES "invoices"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_hospital_id_receipt_id_fkey" FOREIGN KEY ("hospital_id", "receipt_id") REFERENCES "receipts"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_hospital_id_invoice_id_fkey" FOREIGN KEY ("hospital_id", "invoice_id") REFERENCES "invoices"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_hospital_id_patient_id_fkey" FOREIGN KEY ("hospital_id", "patient_id") REFERENCES "patients"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_hospital_id_approval_request_id_fkey" FOREIGN KEY ("hospital_id", "approval_request_id") REFERENCES "approval_requests"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_hospital_id_credit_note_id_fkey" FOREIGN KEY ("hospital_id", "credit_note_id") REFERENCES "credit_notes"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_hospital_id_patient_id_fkey" FOREIGN KEY ("hospital_id", "patient_id") REFERENCES "patients"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_hospital_id_approval_request_id_fkey" FOREIGN KEY ("hospital_id", "approval_request_id") REFERENCES "approval_requests"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_hospital_id_shift_id_fkey" FOREIGN KEY ("hospital_id", "shift_id") REFERENCES "cash_shifts"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_hospital_id_receipt_id_fkey" FOREIGN KEY ("hospital_id", "receipt_id") REFERENCES "receipts"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_hospital_id_invoice_id_fkey" FOREIGN KEY ("hospital_id", "invoice_id") REFERENCES "invoices"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_voids" ADD CONSTRAINT "receipt_voids_hospital_id_receipt_id_fkey" FOREIGN KEY ("hospital_id", "receipt_id") REFERENCES "receipts"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_voids" ADD CONSTRAINT "receipt_voids_hospital_id_approval_request_id_fkey" FOREIGN KEY ("hospital_id", "approval_request_id") REFERENCES "approval_requests"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Approval rules (CLAUDE.md section 7 and docs/billing-rules.md). The API follows them; the database
-- refuses anything that would break them, whoever sends it.

ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_hospital_id_invoice_id_fkey"
  FOREIGN KEY ("hospital_id", "invoice_id") REFERENCES "invoices"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_discount_limit" CHECK ("discount_approval_limit_paise" >= 0);

-- What each kind points at, and maker-checker: whoever decides is never whoever asked.
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_shape"
  CHECK ("amount_paise" > 0 AND char_length("reason") BETWEEN 3 AND 500
    AND (("kind" IN ('discount', 'credit_note') AND "invoice_id" IS NOT NULL AND "receipt_id" IS NULL)
      OR ("kind" = 'refund' AND ("invoice_id" IS NULL) <> ("receipt_id" IS NULL))
      OR ("kind" = 'receipt_void' AND "receipt_id" IS NOT NULL AND "invoice_id" IS NULL))
    AND ("result_invoice_id" IS NULL OR ("kind" = 'discount' AND "status" = 'approved')));
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decision"
  CHECK (("status" = 'pending' AND "decided_by_id" IS NULL AND "decided_at" IS NULL AND "decision_note" IS NULL)
    OR ("status" IN ('approved', 'rejected') AND "decided_by_id" IS NOT NULL AND "decided_at" IS NOT NULL
      AND "decided_by_id" <> "requested_by_id"
      AND ("status" = 'approved' OR char_length(coalesce("decision_note", '')) >= 3)));

ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_amounts"
  CHECK ("taxable_paise" >= 0 AND "cgst_paise" >= 0 AND "sgst_paise" >= 0 AND "total_paise" > 0 AND "total_paise" % 100 = 0
    AND "total_paise" = "taxable_paise" + "cgst_paise" + "sgst_paise" + "round_off_paise");
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_amounts"
  CHECK ("line_no" > 0 AND ("quantity" IS NULL OR "quantity" > 0) AND "taxable_paise" >= 0 AND "cgst_paise" >= 0
    AND "sgst_paise" >= 0 AND "total_paise" > 0 AND "total_paise" = "taxable_paise" + "cgst_paise" + "sgst_paise");

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_shape"
  CHECK ("amount_paise" > 0 AND "mode" <> 'card' AND ("invoice_id" IS NULL) <> ("receipt_id" IS NULL));

-- A request is decided once, and only its decision is written.
CREATE FUNCTION "approval_requests_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Approval requests are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."status" <> 'pending' OR NEW."status" = 'pending'
    OR (NEW."id", NEW."hospital_id", NEW."kind", NEW."patient_id", NEW."invoice_id", NEW."receipt_id", NEW."amount_paise",
        NEW."reason", NEW."details", NEW."requested_by_id", NEW."requested_at")
       IS DISTINCT FROM
       (OLD."id", OLD."hospital_id", OLD."kind", OLD."patient_id", OLD."invoice_id", OLD."receipt_id", OLD."amount_paise",
        OLD."reason", OLD."details", OLD."requested_by_id", OLD."requested_at") THEN
    RAISE EXCEPTION 'A request is decided once and never changed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "approval_requests_decided_once" BEFORE UPDATE OR DELETE ON "approval_requests" FOR EACH ROW EXECUTE FUNCTION "approval_requests_guard"();
CREATE TRIGGER "approval_requests_no_truncate" BEFORE TRUNCATE ON "approval_requests" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

CREATE TRIGGER "credit_notes_append_only" BEFORE UPDATE OR DELETE ON "credit_notes" FOR EACH ROW EXECUTE FUNCTION "append_only"();
CREATE TRIGGER "credit_notes_no_truncate" BEFORE TRUNCATE ON "credit_notes" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();
CREATE TRIGGER "credit_note_lines_append_only" BEFORE UPDATE OR DELETE ON "credit_note_lines" FOR EACH ROW EXECUTE FUNCTION "append_only"();
CREATE TRIGGER "credit_note_lines_no_truncate" BEFORE TRUNCATE ON "credit_note_lines" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();
CREATE TRIGGER "refunds_append_only" BEFORE UPDATE OR DELETE ON "refunds" FOR EACH ROW EXECUTE FUNCTION "append_only"();
CREATE TRIGGER "refunds_no_truncate" BEFORE TRUNCATE ON "refunds" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();
CREATE TRIGGER "receipt_voids_append_only" BEFORE UPDATE OR DELETE ON "receipt_voids" FOR EACH ROW EXECUTE FUNCTION "append_only"();
CREATE TRIGGER "receipt_voids_no_truncate" BEFORE TRUNCATE ON "receipt_voids" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

-- Money counted on a bill: payments from receipts that are not void, credit notes, and refunds of
-- an overpaid bill. What is owed is total - credited - paid + refunded.
CREATE FUNCTION "bill_paid"(bill UUID) RETURNS BIGINT
LANGUAGE sql STABLE AS $$
  SELECT coalesce(sum(a."amount_paise"), 0)::BIGINT FROM "receipt_allocations" a
  WHERE a."invoice_id" = bill AND NOT EXISTS (SELECT 1 FROM "receipt_voids" v WHERE v."receipt_id" = a."receipt_id");
$$;

CREATE FUNCTION "bill_credited"(bill UUID) RETURNS BIGINT
LANGUAGE sql STABLE AS $$
  SELECT coalesce(sum("total_paise"), 0)::BIGINT FROM "credit_notes" WHERE "invoice_id" = bill;
$$;

CREATE FUNCTION "bill_refunded"(bill UUID) RETURNS BIGINT
LANGUAGE sql STABLE AS $$
  SELECT coalesce(sum("amount_paise"), 0)::BIGINT FROM "refunds" WHERE "invoice_id" = bill;
$$;

-- What a deposit receipt has left: its amount less what was set against bills or refunded.
CREATE FUNCTION "deposit_left"(deposit UUID) RETURNS BIGINT
LANGUAGE sql STABLE AS $$
  SELECT r."amount_paise"
    - coalesce((SELECT sum("amount_paise") FROM "receipt_allocations" WHERE "receipt_id" = deposit), 0)
    - coalesce((SELECT sum("amount_paise") FROM "refunds" WHERE "receipt_id" = deposit), 0)
  FROM "receipts" r WHERE r."id" = deposit;
$$;

-- Allocations now also respect voids, credit notes and refunds. Replaces the slice 3a version.
CREATE OR REPLACE FUNCTION "receipt_allocations_within_limits"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  receipt RECORD;
  bill RECORD;
  used BIGINT;
BEGIN
  SELECT "amount_paise", "patient_id", "purpose" INTO receipt FROM "receipts" WHERE "id" = NEW."receipt_id" FOR UPDATE;
  SELECT "total_paise", "patient_id", "status" INTO bill FROM "invoices" WHERE "id" = NEW."invoice_id" FOR UPDATE;
  IF bill."status" <> 'issued' OR bill."patient_id" <> receipt."patient_id" THEN
    RAISE EXCEPTION 'Money is set only against an issued bill of the same patient' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM "receipt_voids" WHERE "receipt_id" = NEW."receipt_id") THEN
    RAISE EXCEPTION 'A void receipt cannot be set against a bill' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT coalesce(sum("amount_paise"), 0) INTO used FROM "receipt_allocations" WHERE "receipt_id" = NEW."receipt_id";
  used := used + coalesce((SELECT sum("amount_paise") FROM "refunds" WHERE "receipt_id" = NEW."receipt_id"), 0);
  IF used + NEW."amount_paise" > receipt."amount_paise"
    OR bill_paid(NEW."invoice_id") + NEW."amount_paise" > bill."total_paise" - bill_credited(NEW."invoice_id") + bill_refunded(NEW."invoice_id") THEN
    RAISE EXCEPTION 'An allocation cannot exceed what is left on the receipt or due on the bill' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- A draft with a discount waiting for approval is neither issued nor discarded, except by the
-- approval itself, which records its decision first.
CREATE FUNCTION "invoices_no_pending_discount"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" <> 'draft' AND EXISTS (
    SELECT 1 FROM "approval_requests" WHERE "invoice_id" = OLD."id" AND "kind" = 'discount' AND "status" = 'pending'
  ) THEN
    RAISE EXCEPTION 'This draft has a discount waiting for approval' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "invoices_wait_for_discount" BEFORE UPDATE ON "invoices" FOR EACH ROW EXECUTE FUNCTION "invoices_no_pending_discount"();

-- Credit notes only for an issued bill of the same patient, and never more than the bill in total.
CREATE FUNCTION "credit_notes_within_bill"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  bill RECORD;
  request RECORD;
BEGIN
  SELECT "total_paise", "patient_id", "status" INTO bill FROM "invoices" WHERE "id" = NEW."invoice_id" FOR UPDATE;
  SELECT "kind", "status", "invoice_id", "requested_by_id" INTO request FROM "approval_requests" WHERE "id" = NEW."approval_request_id";
  IF bill."status" <> 'issued' OR bill."patient_id" <> NEW."patient_id"
    OR request."kind" <> 'credit_note' OR request."status" <> 'approved' OR request."invoice_id" <> NEW."invoice_id"
    OR request."requested_by_id" = NEW."approved_by_id" THEN
    RAISE EXCEPTION 'A credit note needs an approved request for an issued bill' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF bill_credited(NEW."invoice_id") + NEW."total_paise" > bill."total_paise" THEN
    RAISE EXCEPTION 'Credit notes cannot add up to more than the bill' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "credit_notes_checked" BEFORE INSERT ON "credit_notes" FOR EACH ROW EXECUTE FUNCTION "credit_notes_within_bill"();

-- Each credit note line stays within what is left of its bill line, part by part.
CREATE FUNCTION "credit_note_lines_within_line"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  line RECORD;
  done RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "credit_notes" WHERE "id" = NEW."credit_note_id" AND "invoice_id" = NEW."invoice_id") THEN
    RAISE EXCEPTION 'A credit note line belongs to its credit note''s bill' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT "taxable_paise", "cgst_paise", "sgst_paise" INTO line FROM "invoice_lines"
    WHERE "invoice_id" = NEW."invoice_id" AND "line_no" = NEW."line_no";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such line on the bill' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT coalesce(sum("taxable_paise"), 0) AS taxable, coalesce(sum("cgst_paise"), 0) AS cgst, coalesce(sum("sgst_paise"), 0) AS sgst
    INTO done FROM "credit_note_lines" WHERE "invoice_id" = NEW."invoice_id" AND "line_no" = NEW."line_no";
  IF done.taxable + NEW."taxable_paise" > line."taxable_paise" OR done.cgst + NEW."cgst_paise" > line."cgst_paise"
    OR done.sgst + NEW."sgst_paise" > line."sgst_paise" THEN
    RAISE EXCEPTION 'A line cannot be credited beyond what was billed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "credit_note_lines_checked" BEFORE INSERT ON "credit_note_lines" FOR EACH ROW EXECUTE FUNCTION "credit_note_lines_within_line"();

-- A refund is paid from the open shift of the cashier paying it, after approval, and never beyond
-- what is left on the deposit or overpaid on the bill.
CREATE FUNCTION "refunds_checked"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  shift RECORD;
  request RECORD;
  receipt RECORD;
  bill RECORD;
BEGIN
  SELECT "cashier_id", "closed_at", "hospital_id" INTO shift FROM "cash_shifts" WHERE "id" = NEW."shift_id" FOR UPDATE;
  IF NOT FOUND OR shift."closed_at" IS NOT NULL OR shift."cashier_id" <> NEW."paid_by_id" OR shift."hospital_id" <> NEW."hospital_id" THEN
    RAISE EXCEPTION 'A refund is paid from the open shift of the cashier paying it' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT "kind", "status", "patient_id", "amount_paise", "invoice_id", "receipt_id" INTO request
    FROM "approval_requests" WHERE "id" = NEW."approval_request_id";
  IF request."kind" <> 'refund' OR request."status" <> 'approved' OR request."patient_id" <> NEW."patient_id"
    OR request."amount_paise" <> NEW."amount_paise"
    OR request."invoice_id" IS DISTINCT FROM NEW."invoice_id" OR request."receipt_id" IS DISTINCT FROM NEW."receipt_id" THEN
    RAISE EXCEPTION 'A refund needs its own approved request' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."receipt_id" IS NOT NULL THEN
    SELECT "purpose", "patient_id" INTO receipt FROM "receipts" WHERE "id" = NEW."receipt_id" FOR UPDATE;
    IF receipt."purpose" <> 'deposit' OR receipt."patient_id" <> NEW."patient_id"
      OR EXISTS (SELECT 1 FROM "receipt_voids" WHERE "receipt_id" = NEW."receipt_id")
      OR deposit_left(NEW."receipt_id") < NEW."amount_paise" THEN
      RAISE EXCEPTION 'A refund cannot exceed what is left on the deposit' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    SELECT "total_paise", "patient_id", "status" INTO bill FROM "invoices" WHERE "id" = NEW."invoice_id" FOR UPDATE;
    IF bill."status" <> 'issued' OR bill."patient_id" <> NEW."patient_id"
      OR bill_paid(NEW."invoice_id") - (bill."total_paise" - bill_credited(NEW."invoice_id")) - bill_refunded(NEW."invoice_id") < NEW."amount_paise" THEN
      RAISE EXCEPTION 'A refund cannot exceed what was overpaid on the bill' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "refunds_within_limits" BEFORE INSERT ON "refunds" FOR EACH ROW EXECUTE FUNCTION "refunds_checked"();

-- A receipt is voided only while its shift is still open, after an approved request, and a deposit
-- only when none of it has been used or refunded.
CREATE FUNCTION "receipt_voids_checked"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  receipt RECORD;
  request RECORD;
BEGIN
  SELECT r."purpose", r."shift_id", s."closed_at" INTO receipt
    FROM "receipts" r JOIN "cash_shifts" s ON s."id" = r."shift_id" WHERE r."id" = NEW."receipt_id" FOR UPDATE OF s;
  SELECT "kind", "status", "receipt_id", "requested_by_id" INTO request FROM "approval_requests" WHERE "id" = NEW."approval_request_id";
  IF request."kind" <> 'receipt_void' OR request."status" <> 'approved' OR request."receipt_id" <> NEW."receipt_id"
    OR request."requested_by_id" = NEW."voided_by_id" THEN
    RAISE EXCEPTION 'A void needs its own approved request' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF receipt."closed_at" IS NOT NULL THEN
    RAISE EXCEPTION 'A receipt can be voided only while its shift is open' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF receipt."purpose" = 'deposit' AND (
    EXISTS (SELECT 1 FROM "receipt_allocations" WHERE "receipt_id" = NEW."receipt_id")
    OR EXISTS (SELECT 1 FROM "refunds" WHERE "receipt_id" = NEW."receipt_id")) THEN
    RAISE EXCEPTION 'A deposit that has been used or refunded cannot be voided' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "receipt_voids_within_rules" BEFORE INSERT ON "receipt_voids" FOR EACH ROW EXECUTE FUNCTION "receipt_voids_checked"();
