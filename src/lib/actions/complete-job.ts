"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  assertRoleForAction,
  WRITE_ROLES,
} from "@/lib/auth-helpers";

/**
 * Called when a job's stage advances to COMPLETE (the terminal "Ready"
 * button). Three things happen here:
 *
 * 1. Client flips from NEW -> EXISTING (first time only).
 * 2. firstCompletedAt is set (first time only).
 * 3. Each kit line on the completed job is rolled into a CustomerKit
 *    record on the client (+ optional property). The kit's recipe is
 *    materialized into CustomerKitItem rows so future inspection
 *    decisions can adjust the per-component snapshot without losing
 *    track of what's physically in the customer's tote.
 *
 * Idempotency: `JobberJob.customerKitsSyncedAt` records when the kit
 * sync ran. If it's set, a re-completion (e.g. user reverts then
 * re-completes) is a no-op for kit sync. The NEW->EXISTING flip is
 * also guarded by checking the client's current status.
 *
 * This sets up the Year-2 path: an EXISTING customer's pre-built
 * kits can be skipped at allocation time because they're already
 * tracked via CustomerKit (the actual allocation branch lives in
 * auto-allocate.ts and ships in a later cut).
 */
export async function completeJobForClient(jobId: string): Promise<{
  converted: boolean;
  kitsSynced: number;
}> {
  await assertRoleForAction(WRITE_ROLES);

  const job = await prisma.jobberJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      clientId: true,
      propertyId: true,
      customerKitsSyncedAt: true,
    },
  });
  if (!job) throw new Error("Job not found");

  const client = await prisma.client.findUnique({
    where: { id: job.clientId },
    select: { id: true, customerStatus: true, firstCompletedAt: true },
  });
  if (!client) return { converted: false, kitsSynced: 0 };

  let converted = false;
  if (client.customerStatus === "NEW") {
    await prisma.client.update({
      where: { id: client.id },
      data: {
        customerStatus: "EXISTING",
        firstCompletedAt: client.firstCompletedAt ?? new Date(),
      },
    });
    converted = true;
  }

  let kitsSynced = 0;
  if (!job.customerKitsSyncedAt) {
    kitsSynced = await syncCustomerKitsForJob(jobId, job.clientId, job.propertyId);
  }

  revalidatePath(`/job-flow/jobs/${jobId}`);
  return { converted, kitsSynced };
}

/**
 * Walk every kit line on the job and upsert a CustomerKit + its
 * CustomerKitItem snapshot for the client. Each call increments the
 * customer's kit count by the line's quantity (an EXISTING customer
 * who orders one more of the same kit type next season ends up with
 * two of that kit, not one).
 */
async function syncCustomerKitsForJob(
  jobId: string,
  clientId: string,
  propertyId: string | null,
): Promise<number> {
  const lines = await prisma.jobLineItem.findMany({
    where: { jobId, kitId: { not: null } },
    include: {
      kit: {
        include: {
          items: { select: { itemId: true, quantity: true } },
        },
      },
    },
  });

  let synced = 0;

  await prisma.$transaction(async (tx) => {
    for (const line of lines) {
      if (!line.kit) continue;
      const addedKitQty = Math.ceil(Number(line.quantity));
      if (addedKitQty <= 0) continue;

      // Find or create the CustomerKit for this (client, property, kit)
      const existing = await tx.customerKit.findFirst({
        where: {
          clientId,
          propertyId: propertyId ?? null,
          kitId: line.kit.id,
        },
      });

      let customerKitId: string;
      if (existing) {
        const updated = await tx.customerKit.update({
          where: { id: existing.id },
          data: {
            quantity: { increment: addedKitQty },
            status: "IN_STORAGE",
          },
          select: { id: true },
        });
        customerKitId = updated.id;
      } else {
        const created = await tx.customerKit.create({
          data: {
            clientId,
            propertyId: propertyId ?? undefined,
            kitId: line.kit.id,
            quantity: addedKitQty,
            status: "IN_STORAGE",
          },
          select: { id: true },
        });
        customerKitId = created.id;
      }

      // Materialize the per-component snapshot. For each component in
      // the kit recipe, increment the CustomerKitItem.quantity by
      // (recipeQty * addedKitQty). The unique constraint on
      // (customerKitId, itemId) lets us upsert cleanly.
      for (const ki of line.kit.items) {
        const addedComponentQty = Math.ceil(
          Number(ki.quantity) * addedKitQty,
        );
        if (addedComponentQty <= 0) continue;

        await tx.customerKitItem.upsert({
          where: {
            customerKitId_itemId: {
              customerKitId,
              itemId: ki.itemId,
            },
          },
          create: {
            customerKitId,
            itemId: ki.itemId,
            quantity: addedComponentQty,
          },
          update: {
            quantity: { increment: addedComponentQty },
          },
        });
      }

      synced++;
    }

    // Mark the job synced so re-completion is a no-op
    await tx.jobberJob.update({
      where: { id: jobId },
      data: { customerKitsSyncedAt: new Date() },
    });
  });

  return synced;
}
