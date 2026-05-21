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
    include: {
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

  for (const line of job.lineItems) {
    const lineQty = Number(line.quantity);
    const ret = Math.min(returnByLine.get(line.id) ?? 0, lineQty);
    const scrap = lineQty - ret;
    totalReturned += ret;
    totalScrapped += scrap;

    if (ret <= 0) continue;

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

  const noteParts: string[] = [];
  if (reason && reason.trim().length > 0) noteParts.push(reason.trim());
  noteParts.push(
    `Returned ${totalReturned}, scrapped ${totalScrapped}.`,
  );
  const notes = noteParts.join(" — ");

  await prisma.$transaction(async (tx) => {
    for (const [itemId, qty] of increments) {
      if (qty <= 0) continue;
      await tx.item.update({
        where: { id: itemId },
        data: { quantity: { increment: qty } },
      });
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
