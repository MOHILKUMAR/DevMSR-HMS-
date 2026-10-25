-- The same Aadhaar or ABHA number can belong to only one patient of a hospital (docs/billing-rules.md).


-- DropIndex
DROP INDEX "patients_hospital_id_aadhaar_blind_index_idx";

-- DropIndex
DROP INDEX "patients_hospital_id_abha_number_blind_index_idx";

-- CreateIndex
CREATE UNIQUE INDEX "patients_hospital_id_aadhaar_blind_index_key" ON "patients"("hospital_id", "aadhaar_blind_index");

-- CreateIndex
CREATE UNIQUE INDEX "patients_hospital_id_abha_number_blind_index_key" ON "patients"("hospital_id", "abha_number_blind_index");

