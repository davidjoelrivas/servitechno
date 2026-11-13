ALTER TABLE "User"
ADD COLUMN "phone" TEXT,
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Employee"
ADD COLUMN "commissionPercentage" DECIMAL(7,4),
ADD COLUMN "commissionBasis" TEXT NOT NULL DEFAULT 'CONTRIBUTION_MARGIN',
ADD COLUMN "commissionNote" TEXT;

CREATE TABLE "UserPermission" (
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("userId", "permissionId")
);

ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permissionId_fkey"
FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
