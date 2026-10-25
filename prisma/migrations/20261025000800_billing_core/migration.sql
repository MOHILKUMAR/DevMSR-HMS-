-- Billing core: charges, bills, receipts, deposits and cash shifts (slice 3a).

-- CreateEnum
CREATE TYPE "charge_status" AS ENUM ('pending', 'billed');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('draft', 'issued', 'discarded');

-- CreateEnum
CREATE TYPE "payment_mode" AS ENUM ('cash', 'upi', 'card', 'bank_transfer', 'cheque');

-- CreateEnum
CREATE TYPE "receipt_purpose" AS ENUM ('bill_payment', 'deposit');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "number_kind" ADD VALUE 'invoice';
ALTER TYPE "number_kind" ADD VALUE 'receipt';

-- AlterTable
ALTER TABLE "hospitals" ADD COLUMN     "gstin" CHAR(15);

-- CreateTable
CREATE TABLE "charges" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "service_item_id" UUID NOT NULL,
    "tariff_rate_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "service_date" DATE NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_rate_paise" BIGINT NOT NULL,
    "tax_rate_bp" INTEGER NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "status" "charge_status" NOT NULL DEFAULT 'pending',
    "invoice_id" UUID,
    "posted_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "status" "invoice_status" NOT NULL DEFAULT 'draft',
    "number" TEXT,
    "financial_year" TEXT,
    "subtotal_paise" BIGINT NOT NULL,
    "discount_paise" BIGINT NOT NULL DEFAULT 0,
    "taxable_paise" BIGINT NOT NULL,
    "cgst_paise" BIGINT NOT NULL,
    "sgst_paise" BIGINT NOT NULL,
    "round_off_paise" BIGINT NOT NULL,
    "total_paise" BIGINT NOT NULL,
    "issuer_snapshot" JSONB,
    "patient_snapshot" JSONB,
    "created_by_id" UUID NOT NULL,
    "issued_by_id" UUID,
    "issued_at" TIMESTAMPTZ(3),
    "discarded_by_id" UUID,
    "discarded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "service_date" DATE NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_rate_paise" BIGINT NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "discount_paise" BIGINT NOT NULL DEFAULT 0,
    "taxable_paise" BIGINT NOT NULL,
    "tax_rate_bp" INTEGER NOT NULL,
    "cgst_paise" BIGINT NOT NULL,
    "sgst_paise" BIGINT NOT NULL,
    "total_paise" BIGINT NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_shifts" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opening_cash_paise" BIGINT NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "counted_cash_paise" BIGINT,
    "expected_cash_paise" BIGINT,
    "difference_paise" BIGINT,
    "difference_reason" TEXT,

    CONSTRAINT "cash_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "shift_id" UUID NOT NULL,
    "purpose" "receipt_purpose" NOT NULL,
    "mode" "payment_mode" NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "reference" TEXT,
    "card_last4" CHAR(4),
    "bank_name" TEXT,
    "received_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_allocations" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "allocated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "charges_hospital_id_patient_id_status_idx" ON "charges"("hospital_id", "patient_id", "status");

-- CreateIndex
CREATE INDEX "charges_invoice_id_idx" ON "charges"("invoice_id");

-- CreateIndex
CREATE INDEX "invoices_hospital_id_patient_id_idx" ON "invoices"("hospital_id", "patient_id");

-- CreateIndex
CREATE INDEX "invoices_hospital_id_status_created_at_idx" ON "invoices"("hospital_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_hospital_id_id_key" ON "invoices"("hospital_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_hospital_id_number_key" ON "invoices"("hospital_id", "number");

-- CreateIndex
CREATE INDEX "invoice_lines_charge_id_idx" ON "invoice_lines"("charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_invoice_id_line_no_key" ON "invoice_lines"("invoice_id", "line_no");

-- CreateIndex
CREATE INDEX "cash_shifts_hospital_id_opened_at_idx" ON "cash_shifts"("hospital_id", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "cash_shifts_hospital_id_id_key" ON "cash_shifts"("hospital_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_shifts_one_open_per_cashier" ON "cash_shifts"("cashier_id") WHERE (closed_at IS NULL);

-- CreateIndex
CREATE INDEX "receipts_hospital_id_patient_id_idx" ON "receipts"("hospital_id", "patient_id");

-- CreateIndex
CREATE INDEX "receipts_shift_id_idx" ON "receipts"("shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_hospital_id_id_key" ON "receipts"("hospital_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_hospital_id_number_key" ON "receipts"("hospital_id", "number");

-- CreateIndex
CREATE INDEX "receipt_allocations_invoice_id_idx" ON "receipt_allocations"("invoice_id");

-- CreateIndex
CREATE INDEX "receipt_allocations_receipt_id_idx" ON "receipt_allocations"("receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "patients_hospital_id_id_key" ON "patients"("hospital_id", "id");

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_hospital_id_patient_id_fkey" FOREIGN KEY ("hospital_id", "patient_id") REFERENCES "patients"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_hospital_id_service_item_id_fkey" FOREIGN KEY ("hospital_id", "service_item_id") REFERENCES "service_items"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_tariff_rate_id_fkey" FOREIGN KEY ("tariff_rate_id") REFERENCES "tariff_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_hospital_id_invoice_id_fkey" FOREIGN KEY ("hospital_id", "invoice_id") REFERENCES "invoices"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_hospital_id_patient_id_fkey" FOREIGN KEY ("hospital_id", "patient_id") REFERENCES "patients"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_hospital_id_invoice_id_fkey" FOREIGN KEY ("hospital_id", "invoice_id") REFERENCES "invoices"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_hospital_id_patient_id_fkey" FOREIGN KEY ("hospital_id", "patient_id") REFERENCES "patients"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_hospital_id_shift_id_fkey" FOREIGN KEY ("hospital_id", "shift_id") REFERENCES "cash_shifts"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_hospital_id_receipt_id_fkey" FOREIGN KEY ("hospital_id", "receipt_id") REFERENCES "receipts"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_hospital_id_invoice_id_fkey" FOREIGN KEY ("hospital_id", "invoice_id") REFERENCES "invoices"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Billing integrity rules (CLAUDE.md section 7 and docs/billing-rules.md). The API follows them; the
-- database refuses anything that would break them, whoever sends it.

ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_gstin_format"
  CHECK ("gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');

ALTER TABLE "charges" ADD CONSTRAINT "charges_amounts"
  CHECK ("quantity" > 0 AND "unit_rate_paise" >= 0 AND "tax_rate_bp" BETWEEN 0 AND 10000
    AND "amount_paise" = "unit_rate_paise" * "quantity");
ALTER TABLE "charges" ADD CONSTRAINT "charges_billed_on_a_bill"
  CHECK ("status" = 'pending' OR "invoice_id" IS NOT NULL);

ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_amounts"
  CHECK ("quantity" > 0 AND "line_no" > 0 AND "discount_paise" >= 0 AND "tax_rate_bp" BETWEEN 0 AND 10000
    AND "amount_paise" = "unit_rate_paise" * "quantity"
    AND "taxable_paise" = "amount_paise" - "discount_paise" AND "taxable_paise" >= 0
    AND "cgst_paise" >= 0 AND "sgst_paise" >= 0 AND "cgst_paise" - "sgst_paise" BETWEEN 0 AND 1
    AND "total_paise" = "taxable_paise" + "cgst_paise" + "sgst_paise");

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts"
  CHECK ("discount_paise" >= 0 AND "taxable_paise" = "subtotal_paise" - "discount_paise" AND "taxable_paise" >= 0
    AND "cgst_paise" >= 0 AND "sgst_paise" >= 0 AND "round_off_paise" BETWEEN -50 AND 50
    AND "total_paise" = "taxable_paise" + "cgst_paise" + "sgst_paise" + "round_off_paise"
    AND "total_paise" % 100 = 0);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_status_fields"
  CHECK (("status" = 'draft' AND "number" IS NULL AND "issued_at" IS NULL AND "discarded_at" IS NULL)
    OR ("status" = 'issued' AND "number" IS NOT NULL AND "financial_year" IS NOT NULL AND "issued_at" IS NOT NULL
      AND "issued_by_id" IS NOT NULL AND "issuer_snapshot" IS NOT NULL AND "patient_snapshot" IS NOT NULL)
    OR ("status" = 'discarded' AND "number" IS NULL AND "discarded_at" IS NOT NULL AND "discarded_by_id" IS NOT NULL));

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_amounts"
  CHECK ("amount_paise" > 0 AND ("card_last4" IS NULL OR "card_last4" ~ '^[0-9]{4}$'));
ALTER TABLE "receipt_allocations" ADD CONSTRAINT "receipt_allocations_amount" CHECK ("amount_paise" > 0);
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_amounts"
  CHECK ("opening_cash_paise" >= 0 AND ("counted_cash_paise" IS NULL OR "counted_cash_paise" >= 0)
    AND (("closed_at" IS NULL AND "counted_cash_paise" IS NULL AND "expected_cash_paise" IS NULL AND "difference_paise" IS NULL)
      OR ("closed_at" IS NOT NULL AND "counted_cash_paise" IS NOT NULL AND "expected_cash_paise" IS NOT NULL
        AND "difference_paise" = "counted_cash_paise" - "expected_cash_paise"
        AND ("difference_paise" = 0 OR char_length(coalesce("difference_reason", '')) >= 3))));

-- A charge never changes, except: a draft bill takes it or lets it go, and issuing that bill marks it billed.
CREATE FUNCTION "charges_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Charges are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW."id", NEW."hospital_id", NEW."patient_id", NEW."service_item_id", NEW."tariff_rate_id", NEW."description",
      NEW."service_date", NEW."quantity", NEW."unit_rate_paise", NEW."tax_rate_bp", NEW."amount_paise", NEW."posted_by_id", NEW."created_at")
     IS DISTINCT FROM
     (OLD."id", OLD."hospital_id", OLD."patient_id", OLD."service_item_id", OLD."tariff_rate_id", OLD."description",
      OLD."service_date", OLD."quantity", OLD."unit_rate_paise", OLD."tax_rate_bp", OLD."amount_paise", OLD."posted_by_id", OLD."created_at")
    OR OLD."status" = 'billed'
    OR NOT (
      (NEW."status" = 'pending' AND OLD."invoice_id" IS NULL AND NEW."invoice_id" IS NOT NULL)
      OR (NEW."status" = 'pending' AND OLD."invoice_id" IS NOT NULL AND NEW."invoice_id" IS NULL)
      OR (NEW."status" = 'billed' AND NEW."invoice_id" IS NOT DISTINCT FROM OLD."invoice_id" AND OLD."invoice_id" IS NOT NULL)
    ) THEN
    RAISE EXCEPTION 'A charge only moves onto a bill, off a draft, or to billed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "charges_fixed" BEFORE UPDATE OR DELETE ON "charges" FOR EACH ROW EXECUTE FUNCTION "charges_guard"();
CREATE TRIGGER "charges_no_truncate" BEFORE TRUNCATE ON "charges" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

-- An issued bill is locked for good. A draft is never edited: it is issued or discarded.
CREATE FUNCTION "invoices_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Bills are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."status" <> 'draft'
    OR NEW."status" = 'draft'
    OR (NEW."id", NEW."hospital_id", NEW."patient_id", NEW."subtotal_paise", NEW."discount_paise", NEW."taxable_paise",
        NEW."cgst_paise", NEW."sgst_paise", NEW."round_off_paise", NEW."total_paise", NEW."created_by_id", NEW."created_at")
       IS DISTINCT FROM
       (OLD."id", OLD."hospital_id", OLD."patient_id", OLD."subtotal_paise", OLD."discount_paise", OLD."taxable_paise",
        OLD."cgst_paise", OLD."sgst_paise", OLD."round_off_paise", OLD."total_paise", OLD."created_by_id", OLD."created_at") THEN
    RAISE EXCEPTION 'An issued bill is locked; a draft can only be issued or discarded' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "invoices_locked" BEFORE UPDATE OR DELETE ON "invoices" FOR EACH ROW EXECUTE FUNCTION "invoices_guard"();
CREATE TRIGGER "invoices_no_truncate" BEFORE TRUNCATE ON "invoices" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

-- Bill lines, receipts and allocations are written once and never changed.
CREATE FUNCTION "append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: records are written once', TG_OP, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "invoice_lines_append_only" BEFORE UPDATE OR DELETE ON "invoice_lines" FOR EACH ROW EXECUTE FUNCTION "append_only"();
CREATE TRIGGER "invoice_lines_no_truncate" BEFORE TRUNCATE ON "invoice_lines" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();
CREATE TRIGGER "receipts_append_only" BEFORE UPDATE OR DELETE ON "receipts" FOR EACH ROW EXECUTE FUNCTION "append_only"();
CREATE TRIGGER "receipts_no_truncate" BEFORE TRUNCATE ON "receipts" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();
CREATE TRIGGER "receipt_allocations_append_only" BEFORE UPDATE OR DELETE ON "receipt_allocations" FOR EACH ROW EXECUTE FUNCTION "append_only"();
CREATE TRIGGER "receipt_allocations_no_truncate" BEFORE TRUNCATE ON "receipt_allocations" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();

-- A receipt goes into an open shift of the cashier who takes it. The shift row is locked, so a
-- receipt and the shift's closing never cross.
CREATE FUNCTION "receipts_open_shift"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  shift RECORD;
BEGIN
  SELECT "cashier_id", "closed_at", "hospital_id" INTO shift FROM "cash_shifts" WHERE "id" = NEW."shift_id" FOR UPDATE;
  IF NOT FOUND OR shift."closed_at" IS NOT NULL OR shift."cashier_id" <> NEW."received_by_id" OR shift."hospital_id" <> NEW."hospital_id" THEN
    RAISE EXCEPTION 'A receipt needs the open shift of the cashier taking it' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "receipts_into_open_shift" BEFORE INSERT ON "receipts" FOR EACH ROW EXECUTE FUNCTION "receipts_open_shift"();

-- An allocation never takes more than is left on the receipt, nor more than is due on the bill, and
-- only an issued bill of the same patient can receive one. Both rows are locked while checking.
CREATE FUNCTION "receipt_allocations_within_limits"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  receipt RECORD;
  bill RECORD;
  used BIGINT;
  paid BIGINT;
BEGIN
  SELECT "amount_paise", "patient_id" INTO receipt FROM "receipts" WHERE "id" = NEW."receipt_id" FOR UPDATE;
  SELECT "total_paise", "patient_id", "status" INTO bill FROM "invoices" WHERE "id" = NEW."invoice_id" FOR UPDATE;
  IF bill."status" <> 'issued' OR bill."patient_id" <> receipt."patient_id" THEN
    RAISE EXCEPTION 'Money is set only against an issued bill of the same patient' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT coalesce(sum("amount_paise"), 0) INTO used FROM "receipt_allocations" WHERE "receipt_id" = NEW."receipt_id";
  SELECT coalesce(sum("amount_paise"), 0) INTO paid FROM "receipt_allocations" WHERE "invoice_id" = NEW."invoice_id";
  IF used + NEW."amount_paise" > receipt."amount_paise" OR paid + NEW."amount_paise" > bill."total_paise" THEN
    RAISE EXCEPTION 'An allocation cannot exceed what is left on the receipt or due on the bill' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "receipt_allocations_checked" BEFORE INSERT ON "receipt_allocations" FOR EACH ROW EXECUTE FUNCTION "receipt_allocations_within_limits"();

-- A shift closes once, with its count, and never changes afterwards.
CREATE FUNCTION "cash_shifts_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Cash shifts are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."closed_at" IS NOT NULL OR NEW."closed_at" IS NULL
    OR (NEW."id", NEW."hospital_id", NEW."cashier_id", NEW."opened_at", NEW."opening_cash_paise")
       IS DISTINCT FROM (OLD."id", OLD."hospital_id", OLD."cashier_id", OLD."opened_at", OLD."opening_cash_paise") THEN
    RAISE EXCEPTION 'A shift only changes when it is closed, once' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "cash_shifts_close_once" BEFORE UPDATE OR DELETE ON "cash_shifts" FOR EACH ROW EXECUTE FUNCTION "cash_shifts_guard"();
CREATE TRIGGER "cash_shifts_no_truncate" BEFORE TRUNCATE ON "cash_shifts" FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();
