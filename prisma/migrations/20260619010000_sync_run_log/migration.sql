-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
    "triggeredByName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "counts" JSONB,
    "phaseErrors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "markedDeleted" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncRun_startedAt_idx" ON "SyncRun"("startedAt");
