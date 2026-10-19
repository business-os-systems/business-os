-- AlterTable
ALTER TABLE "addresses" ADD COLUMN "organizationId" TEXT;

-- CreateIndex
CREATE INDEX "addresses_organizationId_idx" ON "addresses"("organizationId");

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
