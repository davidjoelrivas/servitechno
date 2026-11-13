CREATE TYPE "ProductDocumentType" AS ENUM ('OTHER', 'PHONE', 'ACCESSORY', 'COMPUTER');
CREATE TYPE "ProductCondition" AS ENUM ('NEW', 'USED');
CREATE TYPE "RepairPartSource" AS ENUM ('INVENTORY', 'MANUAL');
CREATE TYPE "DocumentType" AS ENUM ('SALE_RECEIPT', 'SALE_WARRANTY', 'REPAIR_INTAKE', 'REPAIR_RECEIPT', 'REPAIR_WARRANTY', 'PAYMENT_RECEIPT');

ALTER TABLE "Product"
  ADD COLUMN "documentType" "ProductDocumentType" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "condition" "ProductCondition" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "warrantyDays" INTEGER;

ALTER TABLE "SaleItem"
  ADD COLUMN "serial" TEXT,
  ADD COLUMN "color" TEXT,
  ADD COLUMN "capacity" TEXT,
  ADD COLUMN "specifications" TEXT,
  ADD COLUMN "warrantyDays" INTEGER;

ALTER TABLE "Payment" ADD COLUMN "receivedById" TEXT;

ALTER TABLE "RepairOrder"
  ADD COLUMN "conditionChecklist" JSONB,
  ADD COLUMN "serviceRequested" TEXT;

ALTER TABLE "RepairPart"
  ALTER COLUMN "productId" DROP NOT NULL,
  ADD COLUMN "source" "RepairPartSource" NOT NULL DEFAULT 'INVENTORY',
  ADD COLUMN "supplierId" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "unitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "costAlreadyRecorded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "registeredById" TEXT;

UPDATE "RepairPart" rp
SET "description" = p."name"
FROM "Product" p
WHERE rp."productId" = p."id";

UPDATE "RepairPart" rp
SET "registeredById" = r."receivedById"
FROM "RepairOrder" r
WHERE rp."repairId" = r."id";

ALTER TABLE "RepairPart"
  ALTER COLUMN "description" SET NOT NULL,
  ALTER COLUMN "registeredById" SET NOT NULL;

ALTER TABLE "RepairPart"
  ADD CONSTRAINT "RepairPart_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WarrantyPolicy" (
  "id" TEXT NOT NULL,
  "documentType" "ProductDocumentType" NOT NULL,
  "condition" "ProductCondition" NOT NULL,
  "days" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "title" TEXT NOT NULL,
  "conditions" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WarrantyPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WarrantyPolicy_documentType_condition_version_key" ON "WarrantyPolicy"("documentType", "condition", "version");

CREATE TABLE "BusinessDocument" (
  "id" TEXT NOT NULL,
  "number" SERIAL NOT NULL,
  "type" "DocumentType" NOT NULL,
  "dedupKey" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "relatedItemId" TEXT,
  "ownerUserId" TEXT,
  "employeeId" TEXT,
  "snapshot" JSONB NOT NULL,
  "conditionsTitle" TEXT,
  "conditions" JSONB,
  "warrantyStart" TIMESTAMP(3),
  "warrantyEnd" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessDocument_number_key" ON "BusinessDocument"("number");
CREATE UNIQUE INDEX "BusinessDocument_dedupKey_key" ON "BusinessDocument"("dedupKey");
CREATE INDEX "BusinessDocument_sourceType_sourceId_idx" ON "BusinessDocument"("sourceType", "sourceId");
CREATE INDEX "BusinessDocument_type_createdAt_idx" ON "BusinessDocument"("type", "createdAt");
CREATE INDEX "BusinessDocument_employeeId_createdAt_idx" ON "BusinessDocument"("employeeId", "createdAt");
