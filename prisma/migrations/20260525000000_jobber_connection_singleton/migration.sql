-- AlterTable
ALTER TABLE "JobberConnection" ADD COLUMN     "singleton" TEXT NOT NULL DEFAULT 'singleton';

-- CreateIndex
CREATE UNIQUE INDEX "JobberConnection_singleton_key" ON "JobberConnection"("singleton");
