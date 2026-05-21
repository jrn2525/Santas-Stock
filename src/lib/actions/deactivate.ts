"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  assertRoleForAction,
  WRITE_ROLES,
  requireUser,
} from "@/lib/auth-helpers";
import { isValidTransition } from "@/lib/job-flow";

/**
 * Per-line decision when deactivating a job. `returnQty` is how many units
 * of this line go back into inventory; the remainder of the line's quantity
 * is implicitly scrapped (lost — inventory was already decremented at
 * allocation, so we just don't restore it).
 */
export type DeactivateDecision = {
  jobLineItemId: string;
  returnQty: number;
};

/**
 * Deactivate a job: return some/all of the allocated inventory and move
 * the job into the DEACTIVATED terminal stage. Atomic — either every line
 * applies cleanly or none do.
 *
 * For an item line, `returnQty` of that item is restored.
 * For a kit line, each component is restored by `returnQty * recipeQty`.
 * Unresolved lines (no item, no kit) are ignored.
 *
 * Year-2 cleanup: for any kit line that drew from the customer's tote
 * at allocation (kitsFromTote > 0), the corresponding CustomerKit and
 * CustomerKitItem rows are decremented by that much. The customer
 * doesn't own those kits anymore regardless of whether the components
 * were returned to the shared pool or scrapped — they left.
 */
export async function deactivateJob(
  jobId: string,
  decisions: DeactivateDecision[],
  reason: string | null,
): Promise<{ totalReturned: number; totalScrapped: number }> {
  await assertRoleForAction(WRITE_ROLES);
  const user = await requireUser();

  const job = await prisma.jobberJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      clientId: true,
      propertyId: true,
      currentStage: true,
      lineItems: {
        include: {
          item: { select: { id: true } },
          kit: {
            include: {
              items: { select: { itemId: true, quantity: true } },
            },
          },
        },
      },
    },
  });
  if (!job) throw new Error("Job not found");
  if (job.currentStage === "DEACTIVATED") {
    throw new Error("Job is already deactivated.");
  }
  if (!isValidTransition(job.currentStage, "DEACTIVATED")) {
    throw new Error(
      `Can't deactivate from stage ${job.currentStage}. Reach Inspection first.`,
    );
  }

  const returnByLine = new Map<string, number>();
  for (const d of decisions) {
    returnByLine.set(d.jobLineItemId, Math.max(0, d.returnQty));
  }

  const increments = new Map<string, number>();
  let totalReturned = 0;
  let totalScrapped = 0;
  let totalKitsRemovedFromTote = 0;

  // CustomerKit cleanup planning: per matching CustomerKit row, accumulate
  // the kit-count decrement and per-component snapshot decrements.
  type ToteUpdate = {
    kitId: string;
    kitDecrement: number;
    componentDecrements: Map<string, number>; // itemId -> qty to remove
  };
  // Key shape: `${kitId}` (we look up the actual CustomerKit row inside
  // the transaction below to keep things simple)
  const toteUpdates: ToteUpdate[] = [];

  for (const line of job.lineItems) {
    const lineQty = Number(line.quantity);
    const ret = Math.min(returnByLine.get(line.id) ?? 0, lineQty);
    const scrap = lineQty - ret;
    totalReturned += ret;
    totalScrapped += scrap;

    if (ret > 0) {
      if (line.item) {
        const inc = Math.floor(ret);
        if (inc > 0) {
          increments.set(
            line.item.id,
            (increments.get(line.item.id) ?? 0) + inc,
          );
        }
      } else if (line.kit) {
        for (const ki of line.kit.items) {
          const inc = Math.floor(Number(ki.quantity) * ret);
          if (inc > 0) {
            increments.set(
              ki.itemId,
              (increments.get(ki.itemId) ?? 0) + inc,
            );
          }
        }
      }
    }

    // Year-2 tote cleanup: regardless of return/scrap split, any kits
    // that came from the customer's tote at allocation are leaving the
    // tote permanently. Decrement CustomerKit + per-component snapshot.
    if (line.kit && line.kitsFromTote > 0) {
      const componentDecrements = new Map<string, number>();
      for (const ki of line.kit.items) {
        const dec = Math.floor(Number(ki.quantity) * line.kitsFromTote);
        if (dec > 0) {
          componentDecrements.set(ki.itemId, dec);
        }
      }
      toteUpdates.push({
        kitId: line.kit.id,
        kitDecrement: line.kitsFromTote,
        componentDecrements,
      });
      totalKitsRemovedFromTote += line.kitsFromTote;
    }
  }

  const noteParts: string[] = [];
  if (reason && reason.trim().length > 0) noteParts.push(reason.trim());
  noteParts.push(
    `Returned ${totalReturned}, scrapped ${totalScrapped}.`,
  );
  if (totalKitsRemovedFromTote > 0) {
    noteParts.push(
      `Removed ${totalKitsRemovedFromTote} kit${totalKitsRemovedFromTote === 1 ? "" : "s"} from customer tote.`,
    );
  }
  const notes = noteParts.join(" — ");

  await prisma.$transaction(async (tx) => {
    for (const [itemId, qty] of increments) {
      if (qty <= 0) continue;
      await tx.item.update({
        where: { id: itemId },
        data: { quantity: { increment: qty } },
      });
    }

    // Year-2 tote cleanup. For each kit line that drew from the tote,
    // find the matching CustomerKit, decrement quantity + per-component
    // snapshots, and delete the row if it hits zero.
    for (const update of toteUpdates) {
      const tote = await tx.customerKit.findFirst({
        where: {
          clientId: job.clientId,
          propertyId: job.propertyId ?? null,
          kitId: update.kitId,
        },
      });
      if (!tote) continue;

      const newKitQty = Math.max(0, tote.quantity - update.kitDecrement);

      // Per-component decrements on CustomerKitItem snapshots
      for (const [itemId, dec] of update.componentDecrements) {
        const cki = await tx.customerKitItem.findUnique({
          where: {
            customerKitId_itemId: {
              customerKitId: tote.id,
              itemId,
            },
          },
        });
        if (!cki) continue;
        const newSnapshot = Math.max(0, cki.quantity - dec);
        if (newKitQty === 0 || newSnapshot === 0) {
          // CustomerKit row is going to be deleted (or this component
          // is fully gone) — the cascading delete on CustomerKit will
          // clean up children. For partial decrements, update inline.
          if (newKitQty === 0) continue;
          await tx.customerKitItem.delete({ where: { id: cki.id } });
        } else {
          await tx.customerKitItem.update({
            where: { id: cki.id },
            data: { quantity: newSnapshot },
          });
        }
      }

      if (newKitQty === 0) {
        // The customer no longer owns any of this kit type; clean up
        // the row. Cascade deletes CustomerKitItem children.
        await tx.customerKit.delete({ where: { id: tote.id } });
      } else {
        // Some kits remain; the ones that left went out of the tote
        // (customer leaving), and the rest are still in storage.
        await tx.customerKit.update({
          where: { id: tote.id },
          data: { quantity: newKitQty, status: "IN_STORAGE" },
        });
      }
    }

    await tx.jobberJob.update({
      where: { id: jobId },
      data: { currentStage: "DEACTIVATED" },
    });
    await tx.jobStageEvent.create({
      data: {
        jobId,
        fromStage: job.currentStage,
        toStage: "DEACTIVATED",
        byUserId: user.id,
        notes,
      },
    });
  });

  revalidatePath(`/job-flow/jobs/${jobId}`);
  revalidatePath("/inventory/items");
  return { totalReturned, totalScrapped };
}
