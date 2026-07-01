-- AlterTable
ALTER TABLE "JobberJob" ADD COLUMN     "serviceCallCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "JobTombstone" (
    "id" TEXT NOT NULL,
    "jobberJobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobTombstone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobTombstone_jobberJobId_key" ON "JobTombstone"("jobberJobId");

-- "Service Call" is labor-only — make it a non-stock item so it never awaits stock.
UPDATE "Item" SET "tracksStock" = false WHERE "name" = 'Service Call';
