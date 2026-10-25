-- CreateEnum
CREATE TYPE "service_kind" AS ENUM ('consultation', 'room', 'nursing', 'procedure', 'investigation', 'other');

-- AlterTable
ALTER TABLE "hospitals" ADD COLUMN     "address_line" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "pincode" CHAR(6),
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "wards" ADD COLUMN     "room_category_id" UUID;

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "user_id" UUID,
    "full_name" TEXT NOT NULL,
    "qualification" TEXT,
    "registration_number" TEXT,
    "is_visiting" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_categories" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "room_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_items" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "service_kind" NOT NULL,
    "doctor_id" UUID,
    "room_category_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tariff_rates" (
    "id" UUID NOT NULL,
    "hospital_id" UUID NOT NULL,
    "service_item_id" UUID NOT NULL,
    "rate_paise" BIGINT NOT NULL,
    "tax_rate_bp" INTEGER NOT NULL DEFAULT 0,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tariff_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_hospital_id_code_key" ON "departments"("hospital_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "departments_hospital_id_id_key" ON "departments"("hospital_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_user_id_key" ON "doctors"("user_id");

-- CreateIndex
CREATE INDEX "doctors_hospital_id_department_id_idx" ON "doctors"("hospital_id", "department_id");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_hospital_id_id_key" ON "doctors"("hospital_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "room_categories_hospital_id_code_key" ON "room_categories"("hospital_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "room_categories_hospital_id_id_key" ON "room_categories"("hospital_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "service_items_hospital_id_code_key" ON "service_items"("hospital_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "service_items_hospital_id_id_key" ON "service_items"("hospital_id", "id");

-- CreateIndex
CREATE INDEX "tariff_rates_service_item_id_effective_from_idx" ON "tariff_rates"("service_item_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "tariff_rates_one_open_rate" ON "tariff_rates"("service_item_id") WHERE (effective_to IS NULL);

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_hospital_id_department_id_fkey" FOREIGN KEY ("hospital_id", "department_id") REFERENCES "departments"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_categories" ADD CONSTRAINT "room_categories_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_hospital_id_doctor_id_fkey" FOREIGN KEY ("hospital_id", "doctor_id") REFERENCES "doctors"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_hospital_id_room_category_id_fkey" FOREIGN KEY ("hospital_id", "room_category_id") REFERENCES "room_categories"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_hospital_id_fkey" FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_hospital_id_service_item_id_fkey" FOREIGN KEY ("hospital_id", "service_item_id") REFERENCES "service_items"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wards" ADD CONSTRAINT "wards_hospital_id_room_category_id_fkey" FOREIGN KEY ("hospital_id", "room_category_id") REFERENCES "room_categories"("hospital_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity rules that schema.prisma cannot express.

ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_pincode_check"
  CHECK ("pincode" IS NULL OR "pincode" ~ '^[1-9][0-9]{5}$');

-- Money is integer paise and never negative. Tax is in basis points: 0 to 100%.
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_rate_paise_check" CHECK ("rate_paise" >= 0);
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_tax_rate_bp_check" CHECK ("tax_rate_bp" BETWEEN 0 AND 10000);
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_period_check"
  CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");

-- Rate history explains every past bill, so it is never edited or deleted. The one change allowed
-- is closing an open rate (setting effective_to) when a new rate takes over.
CREATE FUNCTION "tariff_rates_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DELETE on tariff_rates is not allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."effective_to" IS NOT NULL
    OR NEW."effective_to" IS NULL
    OR (NEW."id", NEW."hospital_id", NEW."service_item_id", NEW."rate_paise", NEW."tax_rate_bp", NEW."effective_from", NEW."created_at")
       IS DISTINCT FROM
       (OLD."id", OLD."hospital_id", OLD."service_item_id", OLD."rate_paise", OLD."tax_rate_bp", OLD."effective_from", OLD."created_at")
    OR NEW."created_by_id" IS DISTINCT FROM OLD."created_by_id" THEN
    RAISE EXCEPTION 'Only closing an open rate is allowed on tariff_rates' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "tariff_rates_history_only"
  BEFORE UPDATE OR DELETE ON "tariff_rates"
  FOR EACH ROW EXECUTE FUNCTION "tariff_rates_guard"();

CREATE TRIGGER "tariff_rates_no_truncate"
  BEFORE TRUNCATE ON "tariff_rates"
  FOR EACH STATEMENT EXECUTE FUNCTION "reject_change"();
