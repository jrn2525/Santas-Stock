-- AlterTable
ALTER TABLE "JobberJob" ADD COLUMN     "deletedInJobberAt" TIMESTAMP(3);
ALTER TABLE "JobberJob" ADD COLUMN     "staleDismissedAt" TIMESTAMP(3);
