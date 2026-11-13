ALTER TABLE "Sale" ADD COLUMN "assistantProposalId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "assistantProposalId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "assistantProposalId" TEXT;

CREATE UNIQUE INDEX "Sale_assistantProposalId_key" ON "Sale"("assistantProposalId");
CREATE UNIQUE INDEX "Purchase_assistantProposalId_key" ON "Purchase"("assistantProposalId");
CREATE UNIQUE INDEX "Payment_assistantProposalId_key" ON "Payment"("assistantProposalId");
