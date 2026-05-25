-- AlterTable
ALTER TABLE "ReplacementQueue" ADD COLUMN     "jobLineItemId" TEXT;

-- CreateIndex
CREATE INDEX "ReplacementQueue_jobLineItemId_idx" ON "ReplacementQueue"("jobLineItemId");

-- AddForeignKey
ALTER TABLE "ReplacementQueue" ADD CONSTRAINT "ReplacementQueue_jobLineItemId_fkey" FOREIGN KEY ("jobLineItemId") REFERENCES "JobLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
