-- A rate that has not started yet can be cancelled. It is kept, marked cancelled, and never applies;
-- the rate before it is reopened so it carries on. Past periods still never change.

-- DropIndex
DROP INDEX "tariff_rates_one_open_rate";

-- AlterTable
ALTER TABLE "tariff_rates" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMPTZ(3),
ADD COLUMN     "cancelled_by_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "tariff_rates_one_open_rate" ON "tariff_rates"("service_item_id") WHERE (effective_to IS NULL AND cancelled_at IS NULL);

-- Who, when and why are recorded together, or not at all.
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_cancel_complete"
  CHECK (("cancelled_at" IS NULL) = ("cancelled_by_id" IS NULL) AND ("cancelled_at" IS NULL) = ("cancel_reason" IS NULL));
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_cancel_reason_length"
  CHECK (char_length("cancel_reason") BETWEEN 3 AND 200);

-- The only changes a rate may ever take, one per update:
--   close:  an open rate gets its end date (the day before the next rate starts);
--   cancel: a rate that has not started yet (IST) is marked cancelled;
--   reopen: the rate before a cancelled one loses its end date, if that date has not passed and no
--           other rate follows it.
-- The amount, tax, start date and creator never change, and a cancelled rate never changes again.
CREATE OR REPLACE FUNCTION "tariff_rates_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DELETE on tariff_rates is not allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF (NEW."id", NEW."hospital_id", NEW."service_item_id", NEW."rate_paise", NEW."tax_rate_bp", NEW."effective_from", NEW."created_at", NEW."created_by_id")
       IS DISTINCT FROM
     (OLD."id", OLD."hospital_id", OLD."service_item_id", OLD."rate_paise", OLD."tax_rate_bp", OLD."effective_from", OLD."created_at", OLD."created_by_id")
    OR OLD."cancelled_at" IS NOT NULL THEN
    RAISE EXCEPTION 'Rates are history: only closing, cancelling or reopening is allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Close.
  IF OLD."effective_to" IS NULL AND NEW."effective_to" IS NOT NULL AND NEW."cancelled_at" IS NULL THEN
    RETURN NEW;
  END IF;

  -- Cancel.
  IF NEW."cancelled_at" IS NOT NULL
    AND NEW."effective_to" IS NOT DISTINCT FROM OLD."effective_to"
    AND OLD."effective_from" > today THEN
    RETURN NEW;
  END IF;

  -- Reopen.
  IF OLD."effective_to" IS NOT NULL AND NEW."effective_to" IS NULL AND NEW."cancelled_at" IS NULL
    AND OLD."effective_to" >= today
    AND NOT EXISTS (
      SELECT 1 FROM "tariff_rates" AS later
      WHERE later."service_item_id" = OLD."service_item_id"
        AND later."id" <> OLD."id"
        AND later."cancelled_at" IS NULL
        AND later."effective_from" > OLD."effective_to"
    ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Rates are history: only closing, cancelling or reopening is allowed' USING ERRCODE = 'insufficient_privilege';
END;
$$;
