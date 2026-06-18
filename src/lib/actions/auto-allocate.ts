"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { withJobLock } from "@/lib/job-lock";
import { deductStock } from "@/lib/stock";
import {
  assertRoleForAction,
  requireUser,
  WRITE_ROLES,
} from "@/lib/auth-helpers";
import { findCustomerKit } from "@/lib/customer-kit";

/**
 * Runs when a job enters the ALLOCATED stage. For each pick list line:
 *  - Item line: deduct line.quantity from Item.quantity. If short, record
 *    a JobLineShortage for the missing amount and only deduct what's available.
 *  - Kit line:
 *      - For EXISTING customers with a matching CustomerKit in storage,
 *        consume from the tote first (kitsFromTote). No shared-pool draw
 *        for that portion — the customer already owns those kits.
 *      - For any remaining (line.quantity - kitsFromTote) kits, expand
 *        the recipe and deduct components from the shared pool as Year 1.
 *  - Unresolved line (no item / no kit, just rawName): skip silently.
 *
 * Idempotent. Lines with isAllocated = true are skipped on re-runs.
 * Sets job.isOnHold = true if any shortages were created.
 */
export async function autoAllocateJob(jobId: string): Promise<{
  allocated: number;
  shortages: number;
  skipped: number;
  fromTote: number;
}> {
  await assertRoleForAction(WRITE_ROLES);

  const job = await prisma.jobberJob.findUnique({
    where: { id: jobId },
    include: {
      client: { select: { customerStatus: true } },
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

  const isExistingCustomer = job.client?.customerStatus === "EXISTING";

  let allocated = 0;
  let shortages = 0;
  let skipped = 0;
  let fromTote = 0;

  for (const line of job.lineItems) {
    const qty = Math.ceil(Number(line.quantity));

    // Kit line + existing customer + matching CustomerKit in storage =
    // consume from the tote before falling through to recipe expansion.
    let kitsFromTote = 0;
    let customerKitIdToFlag: string | null = null;
    if (line.kit && isExistingCustomer && qty > 0) {
      const tote = await findCustomerKit(prisma, {
        clientId: job.clientId,
        propertyId: job.propertyId ?? null,
        kitId: line.kit.id,
        inStorageOnly: true,
      });
      if (tote && tote.quantity > 0) {
        kitsFromTote = Math.min(qty, tote.quantity);
        customerKitIdToFlag = tote.id;
      }
    }

    const remainingQty = qty - kitsFromTote;

    // Build the list of (itemId, needed) pairs for the remaining qty.
    // We deliberately drop the `itemQuantity` we read above — the
    // available count is re-fetched INSIDE the per-line transaction so
    // two lines on the same job (or two kits sharing a component) can't
    // both think the full original stock is available. Without this,
    // multiple lines hitting the same item drive inventory negative
    // because Prisma `decrement` doesn't clamp at zero.
    const needs: Array<{ itemId: string; needed: number }> = [];

    if (line.item) {
      needs.push({
        itemId: line.item.id,
        needed: remainingQty,
      });
    } else if (line.kit) {
      if (remainingQty > 0) {
        for (const ki of line.kit.items) {
          needs.push({
            itemId: ki.item.id,
            needed: Math.ceil(Number(ki.quantity) * remainingQty),
          });
        }
      }
    } else {
      skipped++;
      continue;
    }

    // Allocate each need in a single transaction per line so the line's
    // state stays consistent even if something later in the loop fails.
    await prisma.$transaction(async (tx) => {
      for (const need of needs) {
        if (need.needed <= 0) continue;

        // Atomically deduct only what's actually on hand (never below zero),
        // so earlier lines in this pass AND concurrent allocations from other
        // jobs are all reflected. The preloaded item.quantity is too stale to
        // trust; deductStock re-reads + guards inside the transaction.
        const toDeduct = await deductStock(tx, need.itemId, need.needed);
        const short = need.needed - toDeduct;

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

      if (customerKitIdToFlag && kitsFromTote > 0) {
        await tx.customerKit.update({
          where: { id: customerKitIdToFlag },
          data: { status: "OUT_FOR_SEASON" },
        });
      }

      await tx.jobLineItem.update({
        where: { id: line.id },
        data: { isAllocated: true, kitsFromTote },
      });
    });

    allocated++;
    if (kitsFromTote > 0) fromTote += kitsFromTote;
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
  return { allocated, shortages, skipped, fromTote };
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
  return withJobLock(jobId, () => doReleaseAwaitingStock(jobId));
}

async function doReleaseAwaitingStock(jobId: string): Promise<{
  released: number;
  stillShort: number;
}> {
  await assertRoleForAction(WRITE_ROLES);

  const shortages = await prisma.jobLineShortage.findMany({
    where: { jobLineItem: { jobId } },
    select: { id: true, itemId: true, quantityShort: true },
  });

  let released = 0;
  let stillShort = 0;

  for (const s of shortages) {
    // Atomically deduct only what's on hand (never below zero), so a
    // concurrent allocation/change-order on another job for the same item
    // can't be double-spent here. deductStock re-reads + guards inside the tx.
    const result = await prisma.$transaction(async (tx) => {
      const toDeduct = await deductStock(tx, s.itemId, s.quantityShort);
      const remaining = s.quantityShort - toDeduct;

      if (toDeduct > 0) {
        if (remaining > 0) {
          await tx.jobLineShortage.update({
            where: { id: s.id },
            data: { quantityShort: remaining },
          });
        } else {
          await tx.jobLineShortage.delete({ where: { id: s.id } });
        }
      }
      return { toDeduct, remaining };
    });

    if (result.toDeduct > 0) released++;
    const remaining = result.remaining;

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
 *
 * "use server" exports are public endpoints. Gate this read so an
 * unauthenticated caller can't probe job state.
 */
export async function jobHasShortages(jobId: string): Promise<boolean> {
  await requireUser();
  const count = await prisma.jobLineShortage.count({
    where: { jobLineItem: { jobId } },
  });
  return count > 0;
}
