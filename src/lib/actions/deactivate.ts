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
 * Per-line decision when deactivating a job.
 *
 * Item lines: a single returnQty for the item; the rest is scrapped.
 * Kit lines: a per-component return/scrap decision. Each component
 * carries its own returnQty (capped at recipeQty * lineQty); the rest
 * is scrapped. This mirrors the per-component Good/Repaired/Dead model
 * the inspection page uses.
 */
export type DeactivateItemDecision = {
  jobLineItemId: string;
  kind: "item";
  itemId: string;
  returnQty: number;
};

export type DeactivateComponentDecision = {
  componentItemId: string;
  returnQty: number;
};

export type DeactivateKitDecision = {
  jobLineItemId: string;
  kind: "kit";
  components: DeactivateComponentDecision[];
};

export type DeactivateDecision =
  | DeactivateItemDecision
  | DeactivateKitDecision;

/**
 * Deactivate a job: return some/all of the allocated inventory and move
 * the job into the DEACTIVATED terminal stage. Atomic — either every
 * line applies cleanly or none do.
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

  // Index incoming decisions by jobLineItemId for lookup
  const decisionByLineId = new Map<string, DeactivateDecision>();
  for (const d of decisions) {
    decisionByLineId.set(d.jobLineItemId, d);
  }

  const increments = new Map<string, number>();
  let totalReturned = 0;
  let totalScrapped = 0;
  let totalKitsRemovedFromTote = 0;

  type ToteUpdate = {
    kitId: string;
    kitDecrement: number;
    componentDecrements: Map<string, number>;
  };
  const toteUpdates: ToteUpdate[] = [];

  for (const line of job.lineItems) {
    const decision = decisionByLineId.get(line.id);
    const lineQty = Number(line.quantity);

    if (line.item && decision?.kind === "item") {
      const ret = Math.max(
        0,
        Math.min(lineQty, decision.returnQty),
      );
      const scrap = lineQty - ret;
      totalReturned += ret;
      totalScrapped += scrap;
      const inc = Math.floor(ret);
      if (inc > 0) {
        increments.set(
          line.item.id,
          (increments.get(line.item.id) ?? 0) + inc,
        );
      }
    } else if (line.kit && decision?.kind === "kit") {
      // Per-component return/scrap decisions
      const compDecisions = new Map<string, number>(
        decision.components.map((c) => [c.componentItemId, c.returnQty]),
      );
      for (const ki of line.kit.items) {
        const allocatedForComp = Math.ceil(
          Number(ki.quantity) * lineQty,
        );
        const requestedRet = Math.max(0, compDecisions.get(ki.itemId) ?? 0);
        const ret = Math.min(requestedRet, allocatedForComp);
        const scrap = allocatedForComp - ret;
        totalReturned += ret;
        totalScrapped += scrap;
        if (ret > 0) {
          increments.set(
            ki.itemId,
            (increments.get(ki.itemId) ?? 0) + Math.floor(ret),
          );
        }
      }
    } else if (line.kit && !decision) {
      // No decision provided for this kit line — treat as fully scrapped
      // so the counts in the audit note line up. (Shouldn't happen via
      // the UI; defensive only.)
      for (const ki of line.kit.items) {
        totalScrapped += Math.ceil(Number(ki.quantity) * lineQty);
      }
    } else if (line.item && !decision) {
      totalScrapped += lineQty;
    }

    // Year-2 tote cleanup: regardless of return/scrap split per component,
    // any kit instance that came from the tote at allocation is leaving
    // the customer's tote permanently.
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
        if (newKitQty === 0) continue;
        if (newSnapshot === 0) {
          await tx.customerKitItem.delete({ where: { id: cki.id } });
        } else {
          await tx.customerKitItem.update({
            where: { id: cki.id },
            data: { quantity: newSnapshot },
          });
        }
      }

      if (newKitQty === 0) {
        await tx.customerKit.delete({ where: { id: tote.id } });
      } else {
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
