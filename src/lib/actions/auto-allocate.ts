"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, WRITE_ROLES } from "@/lib/auth-helpers";

/**
 * Runs when a job enters the ALLOCATED stage. For each pick list line:
 *  - Item line: deduct line.quantity from Item.quantity. If short, record
 *    a JobLineShortage for the missing amount and only deduct what's available.
 *  - Kit line: expand the recipe and apply the same per-component logic
 *    (deduct line.quantity * recipe.quantity from each component Item).
 *  - Unresolved line (no item / no kit, just rawName): skip silently.
 *
 * Idempotent. Lines with isAllocated = true are skipped on re-runs.
 * Sets job.isOnHold = true if any shortages were created.
 */
export async function autoAllocateJob(jobId: string): Promise<{
  allocated: number;
  shortages: number;
  skipped: number;
}> {
  await assertRoleForAction(WRITE_ROLES);

  const job = await prisma.jobberJob.findUnique({
    where: { id: jobId },
    include: {
      lineItems: {
        where: { isAllocated: false },
        include: {
          item: { select: { id: true, quantity: true } },
          kit: {
            include: {
              items: {
                include: { item: { select: { id: true, quantity: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!job) throw new Error("Job not found");

  let allocated = 0;
  let shortages = 0;
  let skipped = 0;

  for (const line of job.lineItems) {
    const qty = Math.ceil(Number(line.quantity));

    // Build the list of (itemId, needed) pairs for this line
    const needs: Array<{ itemId: string; itemQuantity: number; needed: number }> = [];

    if (line.item) {
      needs.push({
        itemId: line.item.id,
        itemQuantity: line.item.quantity,
        needed: qty,
      });
    } else if (line.kit) {
      for (const ki of line.kit.items) {
        needs.push({
          itemId: ki.item.id,
          itemQuantity: ki.item.quantity,
          needed: ki.quantity * qty,
        });
      }
    } else {
      skipped++;
      continue;
    }

    // Allocate each need in a single transaction per line so the line's
    // state stays consistent even if something later in the loop fails.
    await prisma.$transaction(async (tx) => {
      for (const need of needs) {
        const available = need.itemQuantity;
        const toDeduct = Math.min(available, need.needed);
        const short = need.needed - toDeduct;

        if (toDeduct > 0) {
          await tx.item.update({
            where: { id: need.itemId },
            data: { quantity: { decrement: toDeduct } },
          });
        }

        if (short > 0) {
          const existing = await tx.jobLineShortage.findFirst({
            where: { jobLineItemId: line.id, itemId: need.itemId },
          });
          if (existing) {
            await tx.jobLineShortage.update({
              where: { id: existing.id },
              data: { quantityShort: existing.quantityShort + short },
            });
          } else {
            await tx.jobLineShortage.create({
              data: {
                jobLineItemId: line.id,
                itemId: need.itemId,
                quantityShort: short,
              },
            });
          }
          shortages++;
        }
      }

      await tx.jobLineItem.update({
        where: { id: line.id },
        data: { isAllocated: true },
      });
    });

    allocated++;
  }

  // Set the on-hold flag based on whether any shortages exist now
  const hasShortages =
    (await prisma.jobLineShortage.count({
      where: { jobLineItem: { jobId } },
    })) > 0;

  await prisma.jobberJob.update({
    where: { id: jobId },
    data: { isOnHold: hasShortages },
  });

  revalidatePath(`/job-flow/jobs/${jobId}`);
  revalidatePath(`/job-flow/jobs/${jobId}/awaiting-stock`);
  revalidatePath("/inventory/items");
  return { allocated, shortages, skipped };
}

/**
 * Called when the user clicks "Release" on the Awaiting Stock page.
 * For each current shortage, tries to deduct the missing quantity from
 * the item's available inventory. If everything's covered, clears the
 * on-hold flag.
 */
export async function releaseAwaitingStock(jobId: string): Promise<{
  released: number;
  stillShort: number;
}> {
  await assertRoleForAction(WRITE_ROLES);

  const shortages = await prisma.jobLineShortage.findMany({
    where: { jobLineItem: { jobId } },
    include: { item: { select: { id: true, quantity: true } } },
  });

  let released = 0;
  let stillShort = 0;

  for (const s of shortages) {
    const available = s.item.quantity;
    const toDeduct = Math.min(available, s.quantityShort);
    const remaining = s.quantityShort - toDeduct;

    if (toDeduct > 0) {
      await prisma.$transaction([
        prisma.item.update({
          where: { id: s.itemId },
          data: { quantity: { decrement: toDeduct } },
        }),
        remaining > 0
          ? prisma.jobLineShortage.update({
              where: { id: s.id },
              data: { quantityShort: remaining },
            })
          : prisma.jobLineShortage.delete({ where: { id: s.id } }),
      ]);
      released++;
    }

    if (remaining > 0) {
      stillShort++;
    }
  }

  const stillHasShortages =
    (await prisma.jobLineShortage.count({
      where: { jobLineItem: { jobId } },
    })) > 0;

  await prisma.jobberJob.update({
    where: { id: jobId },
    data: { isOnHold: stillHasShortages },
  });

  revalidatePath(`/job-flow/jobs/${jobId}`);
  revalidatePath(`/job-flow/jobs/${jobId}/awaiting-stock`);
  revalidatePath("/inventory/items");
  return { released, stillShort };
}

/**
 * Helper: check whether a job currently has any unresolved shortages.
 * Used by the Awaiting Stock page to enable/disable the Release button.
 */
export async function jobHasShortages(jobId: string): Promise<boolean> {
  const count = await prisma.jobLineShortage.count({
    where: { jobLineItem: { jobId } },
  });
  return count > 0;
}
