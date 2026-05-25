-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "singleton" TEXT NOT NULL DEFAULT 'singleton',
    "businessName" TEXT NOT NULL DEFAULT 'Santa''s Stock',
    "logoData" BYTEA,
    "logoMimeType" TEXT,
    "calendarDefaultView" TEXT NOT NULL DEFAULT 'week',
    "calendarHourStart" INTEGER NOT NULL DEFAULT 7,
    "calendarHourEnd" INTEGER NOT NULL DEFAULT 21,
    "defaultPageSize" INTEGER NOT NULL DEFAULT 50,
    "pickListDefaultWindow" TEXT NOT NULL DEFAULT 'all',
    "lowStockDefaultThreshold" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Settings_singleton_key" ON "Settings"("singleton");
