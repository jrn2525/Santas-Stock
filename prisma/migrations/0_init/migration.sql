-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'USER', 'GUEST');

-- CreateEnum
CREATE TYPE "LifecycleType" AS ENUM ('RENTAL_SEASONAL', 'SOLD_PERMANENT', 'INSTALLED_YEAR_ROUND');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('CHRISTMAS', 'LANDSCAPE', 'PERMANENT');

-- CreateEnum
CREATE TYPE "ConditionGrade" AS ENUM ('A', 'B', 'C', 'RETIRED');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('WAREHOUSE', 'AISLE', 'RACK', 'BIN', 'VEHICLE');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('AVAILABLE', 'ALLOCATED');

-- CreateEnum
CREATE TYPE "KitType" AS ENUM ('TEMPLATE', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "KitStatus" AS ENUM ('DRAFT', 'READY', 'DEPLOYED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ReplacementResolution" AS ENUM ('REPAIR', 'REPLACE_FROM_STOCK', 'PURCHASE_ORDER');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'RETIRED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStage" AS ENUM ('NEW', 'ALLOCATED', 'BUILT', 'STAGED', 'INSTALLED', 'INSPECTION', 'COMPLETE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "CustomerEra" AS ENUM ('NEW', 'EXISTING');

-- CreateEnum
CREATE TYPE "CustomerKitStatus" AS ENUM ('IN_STORAGE', 'OUT_FOR_SEASON', 'RETIRED');

-- CreateEnum
CREATE TYPE "InspectionDecision" AS ENUM ('GOOD', 'REPAIRED', 'DEAD');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "jobberUserId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "passwordHash" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobberConnection" (
    "id" TEXT NOT NULL,
    "jobberAccountId" TEXT,
    "accountName" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "connectedById" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobberConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "productType" "ProductType",
    "status" "ItemStatus" NOT NULL DEFAULT 'AVAILABLE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "purchaseCost" DECIMAL(12,2),
    "homeLocation" TEXT,
    "currentLocation" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "lifecycleType" "LifecycleType",
    "retirementMaxSeasons" INTEGER,
    "retirementMaxRepairs" INTEGER,
    "retirementConditionFloor" "ConditionGrade",
    "seasonsDeployed" INTEGER NOT NULL DEFAULT 0,
    "repairCount" INTEGER NOT NULL DEFAULT 0,
    "retirementStatus" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "websites" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customFields" JSONB,
    "jobberProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sku" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "productType" "ProductType",
    "unitCost" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "kitType" "KitType",
    "status" "ItemStatus" NOT NULL DEFAULT 'AVAILABLE',
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "clientId" TEXT,
    "propertyId" TEXT,
    "homeLocation" TEXT,
    "currentLocation" TEXT,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "jobberProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitItem" (
    "kitId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 1,

    CONSTRAINT "KitItem_pkey" PRIMARY KEY ("kitId","itemId")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "jobberClientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "companyName" TEXT,
    "emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "serviceStreet1" TEXT,
    "serviceCity" TEXT,
    "serviceState" TEXT,
    "serviceCountry" TEXT,
    "serviceZip" TEXT,
    "customerStatus" "CustomerEra" NOT NULL DEFAULT 'NEW',
    "firstCompletedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "deactivationReason" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "jobberPropertyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobberJob" (
    "id" TEXT NOT NULL,
    "jobberJobId" TEXT NOT NULL,
    "title" TEXT,
    "jobNumber" TEXT,
    "description" TEXT,
    "instructions" TEXT,
    "total" DECIMAL(12,2),
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "clientId" TEXT NOT NULL,
    "propertyId" TEXT,
    "status" TEXT NOT NULL,
    "currentStage" "JobStage" NOT NULL DEFAULT 'NEW',
    "isOnHold" BOOLEAN NOT NULL DEFAULT false,
    "customerKitsSyncedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobberJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobStageEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "fromStage" "JobStage",
    "toStage" "JobStage" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byUserId" TEXT,
    "notes" TEXT,

    CONSTRAINT "JobStageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrder" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "atStage" "JobStage" NOT NULL,
    "reason" TEXT,
    "diff" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionLineDecision" (
    "id" TEXT NOT NULL,
    "jobLineItemId" TEXT NOT NULL,
    "decision" "InspectionDecision" NOT NULL,
    "appliedDeltas" JSONB,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionLineDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionComponentDecision" (
    "id" TEXT NOT NULL,
    "jobLineItemId" TEXT NOT NULL,
    "componentItemId" TEXT NOT NULL,
    "decision" "InspectionDecision" NOT NULL,
    "appliedDeltas" JSONB,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionComponentDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLineItem" (
    "id" TEXT NOT NULL,
    "jobberLineItemId" TEXT,
    "jobId" TEXT NOT NULL,
    "itemId" TEXT,
    "kitId" TEXT,
    "rawName" TEXT,
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "notes" TEXT,
    "position" INTEGER,
    "isAllocated" BOOLEAN NOT NULL DEFAULT false,
    "kitsFromTote" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLineShortage" (
    "id" TEXT NOT NULL,
    "jobLineItemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantityShort" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLineShortage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobberVisit" (
    "id" TEXT NOT NULL,
    "jobberVisitId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "title" TEXT,
    "instructions" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobberVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobberNote" (
    "id" TEXT NOT NULL,
    "jobberNoteId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "noteCreatedAt" TIMESTAMP(3),
    "clientId" TEXT,
    "jobId" TEXT,
    "visitId" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobberNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplacementQueue" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "flaggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "flaggedByUserId" TEXT,
    "resolution" "ReplacementResolution",
    "poId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,

    CONSTRAINT "ReplacementQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceTicket" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedByUserId" TEXT,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "partsUsed" JSONB,
    "laborMinutes" INTEGER,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "MaintenanceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'jobber',
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldDef" (
    "id" TEXT NOT NULL,
    "appliesTo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" JSONB,

    CONSTRAINT "CustomFieldDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldDefId" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("entityType","entityId","fieldDefId")
);

-- CreateTable
CREATE TABLE "CustomerKit" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "propertyId" TEXT,
    "kitId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "storageLocation" TEXT,
    "status" "CustomerKitStatus" NOT NULL DEFAULT 'IN_STORAGE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerKitItem" (
    "id" TEXT NOT NULL,
    "customerKitId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerKitItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_jobberUserId_key" ON "User"("jobberUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_jobberProductId_key" ON "Item"("jobberProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Kit_jobberProductId_key" ON "Kit"("jobberProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_jobberClientId_key" ON "Client"("jobberClientId");

-- CreateIndex
CREATE UNIQUE INDEX "Property_jobberPropertyId_key" ON "Property"("jobberPropertyId");

-- CreateIndex
CREATE UNIQUE INDEX "JobberJob_jobberJobId_key" ON "JobberJob"("jobberJobId");

-- CreateIndex
CREATE INDEX "JobStageEvent_jobId_idx" ON "JobStageEvent"("jobId");

-- CreateIndex
CREATE INDEX "ChangeOrder_jobId_idx" ON "ChangeOrder"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionLineDecision_jobLineItemId_key" ON "InspectionLineDecision"("jobLineItemId");

-- CreateIndex
CREATE INDEX "InspectionComponentDecision_jobLineItemId_idx" ON "InspectionComponentDecision"("jobLineItemId");

-- CreateIndex
CREATE INDEX "InspectionComponentDecision_componentItemId_idx" ON "InspectionComponentDecision"("componentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionComponentDecision_jobLineItemId_componentItemId_key" ON "InspectionComponentDecision"("jobLineItemId", "componentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "JobLineItem_jobberLineItemId_key" ON "JobLineItem"("jobberLineItemId");

-- CreateIndex
CREATE INDEX "JobLineItem_jobId_idx" ON "JobLineItem"("jobId");

-- CreateIndex
CREATE INDEX "JobLineItem_itemId_idx" ON "JobLineItem"("itemId");

-- CreateIndex
CREATE INDEX "JobLineItem_kitId_idx" ON "JobLineItem"("kitId");

-- CreateIndex
CREATE INDEX "JobLineShortage_jobLineItemId_idx" ON "JobLineShortage"("jobLineItemId");

-- CreateIndex
CREATE INDEX "JobLineShortage_itemId_idx" ON "JobLineShortage"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "JobberVisit_jobberVisitId_key" ON "JobberVisit"("jobberVisitId");

-- CreateIndex
CREATE UNIQUE INDEX "JobberNote_jobberNoteId_key" ON "JobberNote"("jobberNoteId");

-- CreateIndex
CREATE INDEX "JobberNote_clientId_idx" ON "JobberNote"("clientId");

-- CreateIndex
CREATE INDEX "JobberNote_jobId_idx" ON "JobberNote"("jobId");

-- CreateIndex
CREATE INDEX "JobberNote_visitId_idx" ON "JobberNote"("visitId");

-- CreateIndex
CREATE INDEX "ReplacementQueue_itemId_idx" ON "ReplacementQueue"("itemId");

-- CreateIndex
CREATE INDEX "ReplacementQueue_resolution_idx" ON "ReplacementQueue"("resolution");

-- CreateIndex
CREATE INDEX "SyncEvent_status_createdAt_idx" ON "SyncEvent"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDef_appliesTo_name_key" ON "CustomFieldDef"("appliesTo", "name");

-- CreateIndex
CREATE INDEX "CustomFieldValue_entityType_entityId_idx" ON "CustomFieldValue"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "CustomerKit_clientId_idx" ON "CustomerKit"("clientId");

-- CreateIndex
CREATE INDEX "CustomerKit_propertyId_idx" ON "CustomerKit"("propertyId");

-- CreateIndex
CREATE INDEX "CustomerKit_kitId_idx" ON "CustomerKit"("kitId");

-- CreateIndex
CREATE INDEX "CustomerKitItem_itemId_idx" ON "CustomerKitItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerKitItem_customerKitId_itemId_key" ON "CustomerKitItem"("customerKitId", "itemId");

-- AddForeignKey
ALTER TABLE "JobberConnection" ADD CONSTRAINT "JobberConnection_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kit" ADD CONSTRAINT "Kit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kit" ADD CONSTRAINT "Kit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitItem" ADD CONSTRAINT "KitItem_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Kit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitItem" ADD CONSTRAINT "KitItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobberJob" ADD CONSTRAINT "JobberJob_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobberJob" ADD CONSTRAINT "JobberJob_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStageEvent" ADD CONSTRAINT "JobStageEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobberJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStageEvent" ADD CONSTRAINT "JobStageEvent_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobberJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionLineDecision" ADD CONSTRAINT "InspectionLineDecision_jobLineItemId_fkey" FOREIGN KEY ("jobLineItemId") REFERENCES "JobLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionLineDecision" ADD CONSTRAINT "InspectionLineDecision_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionComponentDecision" ADD CONSTRAINT "InspectionComponentDecision_jobLineItemId_fkey" FOREIGN KEY ("jobLineItemId") REFERENCES "JobLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionComponentDecision" ADD CONSTRAINT "InspectionComponentDecision_componentItemId_fkey" FOREIGN KEY ("componentItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionComponentDecision" ADD CONSTRAINT "InspectionComponentDecision_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLineItem" ADD CONSTRAINT "JobLineItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobberJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLineItem" ADD CONSTRAINT "JobLineItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLineItem" ADD CONSTRAINT "JobLineItem_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Kit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLineShortage" ADD CONSTRAINT "JobLineShortage_jobLineItemId_fkey" FOREIGN KEY ("jobLineItemId") REFERENCES "JobLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobLineShortage" ADD CONSTRAINT "JobLineShortage_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobberVisit" ADD CONSTRAINT "JobberVisit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobberJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobberNote" ADD CONSTRAINT "JobberNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobberNote" ADD CONSTRAINT "JobberNote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobberJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobberNote" ADD CONSTRAINT "JobberNote_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "JobberVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementQueue" ADD CONSTRAINT "ReplacementQueue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementQueue" ADD CONSTRAINT "ReplacementQueue_flaggedByUserId_fkey" FOREIGN KEY ("flaggedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementQueue" ADD CONSTRAINT "ReplacementQueue_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_fieldDefId_fkey" FOREIGN KEY ("fieldDefId") REFERENCES "CustomFieldDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerKit" ADD CONSTRAINT "CustomerKit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerKit" ADD CONSTRAINT "CustomerKit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerKit" ADD CONSTRAINT "CustomerKit_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Kit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerKitItem" ADD CONSTRAINT "CustomerKitItem_customerKitId_fkey" FOREIGN KEY ("customerKitId") REFERENCES "CustomerKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerKitItem" ADD CONSTRAINT "CustomerKitItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

