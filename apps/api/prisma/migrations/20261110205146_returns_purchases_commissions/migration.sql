-- CreateEnum
CREATE TYPE "SaleReturnType" AS ENUM ('RETURN', 'VOID');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('CONFIRMED', 'PARTIALLY_PAID', 'PAID', 'VOIDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CashMovementType" ADD VALUE 'PURCHASE_PAYMENT';
ALTER TYPE "CashMovementType" ADD VALUE 'COMMISSION_PAYMENT';

-- AlterEnum
ALTER TYPE "SaleStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- Prevent two concurrent openings for the same physical register.
CREATE UNIQUE INDEX "CashSession_one_open_per_register"
ON "CashSession" ("registerId") WHERE "status" = 'OPEN';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "purchaseId" TEXT,
ADD COLUMN     "saleReturnId" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "returnedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "returnedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SaleReturn" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "saleId" TEXT NOT NULL,
    "type" "SaleReturnType" NOT NULL DEFAULT 'RETURN',
    "reason" TEXT NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "arReduction" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleReturnItem" (
    "id" TEXT NOT NULL,
    "saleReturnId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "restocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SaleReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "supplierId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'CONFIRMED',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPayment" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "methodId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPayment_pkey" PRIMARY KEY ("id")
);

-- Financial invariants enforced below the API layer.
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_positive_total" CHECK ("total" > 0);
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_positive_quantity" CHECK ("quantity" > 0);
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_valid_amounts" CHECK ("total" > 0 AND "paid" >= 0 AND "balance" >= 0);
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_positive_values" CHECK ("quantity" > 0 AND "unitCost" >= 0);
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_positive_amount" CHECK ("amount" > 0);

-- Required ledger accounts and permissions are idempotently provisioned for existing installations.
INSERT INTO "Account" ("id", "code", "name", "type", "active") VALUES
('account-customer-credit', '2103', 'Saldos a favor de clientes', 'LIABILITY', true),
('account-sales-returns', '4103', 'Devoluciones sobre ventas', 'REVENUE', true)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "Permission" ("id", "code", "description") VALUES
('perm-returns-read', 'returns.read', 'Consultar devoluciones'),
('perm-returns-create', 'returns.create', 'Registrar devoluciones y anulaciones'),
('perm-suppliers-read', 'suppliers.read', 'Consultar proveedores'),
('perm-suppliers-manage', 'suppliers.manage', 'Administrar proveedores'),
('perm-purchases-read', 'purchases.read', 'Consultar compras'),
('perm-purchases-create', 'purchases.create', 'Registrar compras'),
('perm-purchases-pay', 'purchases.pay', 'Registrar pagos de compras'),
('perm-commissions-read', 'commissions.read', 'Consultar comisiones'),
('perm-commissions-approve', 'commissions.approve', 'Aprobar comisiones'),
('perm-commissions-pay', 'commissions.pay', 'Pagar comisiones')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id FROM "Role" r CROSS JOIN "Permission" p
WHERE r.name = 'ADMIN' AND p.code IN ('returns.read','returns.create','suppliers.read','suppliers.manage','purchases.read','purchases.create','purchases.pay','commissions.read','commissions.approve','commissions.pay')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id FROM "Role" r CROSS JOIN "Permission" p
WHERE r.name = 'SELLER' AND p.code IN ('returns.read','returns.create','suppliers.read','purchases.read')
ON CONFLICT DO NOTHING;

-- CreateIndex
CREATE UNIQUE INDEX "SaleReturn_number_key" ON "SaleReturn"("number");

-- CreateIndex
CREATE INDEX "SaleReturn_saleId_createdAt_idx" ON "SaleReturn"("saleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_number_key" ON "Purchase"("number");

-- CreateIndex
CREATE INDEX "Purchase_supplierId_createdAt_idx" ON "Purchase"("supplierId", "createdAt");

-- CreateIndex
CREATE INDEX "Purchase_status_dueAt_idx" ON "Purchase"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPayment_idempotencyKey_key" ON "CommissionPayment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CommissionPayment_allocationId_createdAt_idx" ON "CommissionPayment"("allocationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleReturnId_fkey" FOREIGN KEY ("saleReturnId") REFERENCES "SaleReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_saleReturnId_fkey" FOREIGN KEY ("saleReturnId") REFERENCES "SaleReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "CommissionAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
