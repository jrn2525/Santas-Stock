-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "tracksStock" BOOLEAN NOT NULL DEFAULT true;

-- Mark the known pay-by-the-hour services as non-stock so they stop landing
-- on Awaiting Stock.
UPDATE "Item" SET "tracksStock" = false
WHERE "name" IN ('Specialty Service', 'Lift Service');

-- Clear any awaiting-stock shortages those services already accumulated.
DELETE FROM "JobLineShortage"
WHERE "itemId" IN (SELECT "id" FROM "Item" WHERE "tracksStock" = false);

-- Drop the on-hold flag for jobs that, after the cleanup above, have no
-- remaining shortages.
UPDATE "JobberJob" j SET "isOnHold" = false
WHERE j."isOnHold" = true
  AND NOT EXISTS (
    SELECT 1
    FROM "JobLineShortage" s
    JOIN "JobLineItem" li ON li."id" = s."jobLineItemId"
    WHERE li."jobId" = j."id"
  );
