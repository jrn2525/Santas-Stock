-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoSyncTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "autoSyncDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "lastAutoSyncAt" TIMESTAMP(3);
