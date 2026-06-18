"use server";

import { revalidatePath } from "next/cache";
import type { CustomerEra } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  assertRoleForAction,
  WRITE_ROLES,
} from "@/lib/auth-helpers";
import { findCustomerKit } from "@/lib/customer-kit";

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

  // Already completed once: the client was flipped to EXISTING and the kit
  // lines were synced in one transaction (see below), so re-completion (e.g.
  // revert -> re-complete) is a no-op.
  if (job.customerKitsSyncedAt) {
    revalidatePath(`/job-flow/jobs/${jobId}`);
    return { converted: false, kitsSynced: 0 };
  }

  const result = await completeKitSyncAndFlip(
    jobId,
    job.clientId,
    job.propertyId,
    client,
  );

  revalidatePath(`/job-flow/jobs/${jobId}`);
  return result;
}

/**
 * Walk every kit line on the job and upsert a CustomerKit + its
 * CustomerKitItem snapshot for the client. Each call increments the
 * customer's kit count by the line's quantity (an EXISTING customer
 * who orders one more of the same kit type next season ends up with
 * two of that kit, not one).
 */
async function completeKitSyncAndFlip(
  jobId: string,
  clientId: string,
  propertyId: string | null,
  client: {
    id: string;
    customerStatus: CustomerEra;
    firstCompletedAt: Date | null;
  },
): Promise<{ converted: boolean; kitsSynced: number }> {
  const lines = await prisma.jobLineItem.findMany({
    where: { jobId, kitId: { not: null } },
    include: {
      kit: {
        include: {
          items: { select: { itemId: true, quantity: true } },
        },
      },
      componentDecisions: {
        select: { componentItemId: true, decision: true },
      },
    },
  });

  let synced = 0;
  let converted = false;

  await prisma.$transaction(async (tx) => {
    // Flip NEW -> EXISTING in the SAME transaction as the kit sync and the
    // customerKitsSyncedAt stamp, so a failure can't leave the client marked
    // EXISTING while its kits stay unsynced.
    if (client.customerStatus === "NEW") {
      await tx.client.update({
        where: { id: client.id },
        data: {
          customerStatus: "EXISTING",
          firstCompletedAt: client.firstCompletedAt ?? new Date(),
        },
      });
      converted = true;
    }

    for (const line of lines) {
      if (!line.kit) continue;
      const totalKitQty = Math.ceil(Number(line.quantity));
      if (totalKitQty <= 0) continue;

      // Year-2 split: kits drawn from the customer's existing tote don't
      // increase their tote count — they were already there. Only the
      // freshly built portion (totalKitQty - kitsFromTote) needs to be
      // added to the CustomerKit + materialized into CustomerKitItem.
      const freshlyBuiltQty = Math.max(0, totalKitQty - line.kitsFromTote);

      // Find or create the CustomerKit for this (client, property, kit),
      // with the shared client-level fallback so we restore the same tote
      // allocation consumed.
      const existing = await findCustomerKit(tx, {
        clientId,
        propertyId: propertyId ?? null,
        kitId: line.kit.id,
      });

      let customerKitId: string;
      if (existing) {
        // Always restore status to IN_STORAGE (the kits came back to
        // the tote). Only increment quantity by freshly-built count.
        const updated = await tx.customerKit.update({
          where: { id: existing.id },
          data: {
            quantity:
              freshlyBuiltQty > 0
                ? { increment: freshlyBuiltQty }
                : undefined,
            status: "IN_STORAGE",
          },
          select: { id: true },
        });
        customerKitId = updated.id;
      } else if (freshlyBuiltQty > 0) {
        const created = await tx.customerKit.create({
          data: {
            clientId,
            propertyId: propertyId ?? undefined,
            kitId: line.kit.id,
            quantity: freshlyBuiltQty,
            status: "IN_STORAGE",
          },
          select: { id: true },
        });
        customerKitId = created.id;
      } else {
        // No existing tote, nothing freshly built — shouldn't happen in
        // practice (you'd only have kitsFromTote > 0 if a CustomerKit
        // existed), but be defensive.
        continue;
      }

      // Components that Inspection marked DEAD don't actually reach the
      // customer's tote — they physically didn't survive. Subtract them
      // from each component's materialization so the CustomerKitItem
      // snapshot reflects what's actually in the tote, not a hopeful
      // recipe-based count. The dead components were already accounted
      // for at allocation (they were debited from the pool then), so the
      // pool math doesn't change; only the tote snapshot does.
      const deadByComponent = new Set<string>(
        line.componentDecisions
          .filter((cd) => cd.decision === "DEAD")
          .map((cd) => cd.componentItemId),
      );

      // Materialize the per-component snapshot only for the freshly
      // built portion. Tote-sourced kits already had their components
      // counted from a prior season's COMPLETE.
      if (freshlyBuiltQty > 0) {
        for (const ki of line.kit.items) {
          const fullAdded = Math.ceil(
            Number(ki.quantity) * freshlyBuiltQty,
          );
          // Skip components marked DEAD — they don't enter the tote.
          const addedComponentQty = deadByComponent.has(ki.itemId)
            ? 0
            : fullAdded;
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
      }

      synced++;
    }

    // Mark the job synced so re-completion is a no-op
    await tx.jobberJob.update({
      where: { id: jobId },
      data: { customerKitsSyncedAt: new Date() },
    });
  });

  return { converted, kitsSynced: synced };
}
