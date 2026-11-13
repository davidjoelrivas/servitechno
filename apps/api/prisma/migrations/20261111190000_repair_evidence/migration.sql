CREATE TABLE "RepairEvidence" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RepairEvidence_storedName_key" ON "RepairEvidence"("storedName");
CREATE INDEX "RepairEvidence_repairId_createdAt_idx" ON "RepairEvidence"("repairId", "createdAt");

ALTER TABLE "RepairEvidence" ADD CONSTRAINT "RepairEvidence_repairId_fkey"
FOREIGN KEY ("repairId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RepairEvidence" ADD CONSTRAINT "RepairEvidence_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
