-- Sort key for the Customers list: last name for people, company name for
-- businesses. Stored so the paginated list can order in the database.
ALTER TABLE "Client" ADD COLUMN     "sortName" TEXT;

-- Backfill existing rows with the same precedence customerSortName() uses.
UPDATE "Client"
SET "sortName" = COALESCE(
  NULLIF(TRIM("lastName"), ''),
  NULLIF(TRIM("companyName"), ''),
  "name"
);

-- CreateIndex
CREATE INDEX "Client_sortName_idx" ON "Client"("sortName");
