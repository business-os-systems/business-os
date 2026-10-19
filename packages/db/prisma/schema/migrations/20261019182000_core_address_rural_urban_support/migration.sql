-- AlterTable
ALTER TABLE "addresses" ADD COLUMN "addressType" VARCHAR(16) NOT NULL DEFAULT 'URBAN',
ADD COLUMN "village" VARCHAR(191),
ADD COLUMN "postOffice" VARCHAR(191),
ADD COLUMN "district" VARCHAR(100),
ALTER COLUMN "streetAddress" DROP NOT NULL,
ALTER COLUMN "city" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "addresses_addressType_idx" ON "addresses"("addressType");
CREATE INDEX "addresses_district_state_country_idx" ON "addresses"("district", "state", "country");
