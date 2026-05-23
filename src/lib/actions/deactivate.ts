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
      customerKitsSyncedAt: true,
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
      // Per-component return/scrap decisions. The allocated component
      // count is the full recipe × lineQty regardless of whether the
      // line was Year-1, Year-2, or completed-then-reverted — at
      // deactivation the customer is leaving, so everything they had
      // (tote-sourced or freshly built) is physically returning to the
      // warehouse. Components the user marks Return go back into the
      // shared pool; Scrap leaves them permanently gone.
      const compDecisions = new Map<string, number>(
        decision.components.map((c) => [c.componentItemId, c.returnQty]),
      );
      for (const ki of line.kit.items) {
        const allocatedForComp = Math.ceil(
          Number(ki.quantity) * lineQty,
        );
        if (allocatedForComp <= 0) continue;
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
      // so the counts in the audit note line up.
      for (const ki of line.kit.items) {
        totalScrapped += Math.ceil(Number(ki.quantity) * lineQty);
      }
    } else if (line.item && !decision) {
      totalScrapped += lineQty;
    }

    // Tote cleanup. Two sources of "kits in this customer's tote at
    // deactivation time":
    //   1. kitsFromTote: kits that came FROM the tote at allocation
    //      (Year-2 reuse). These are in tote with status OUT_FOR_SEASON.
    //   2. If the job had reached COMPLETE before being reverted
    //      (customerKitsSyncedAt set), the freshly-built portion was
    //      added to the tote at that time. line.quantity - kitsFromTote
    //      kits live in the tote thanks to that COMPLETE.
    // The customer is leaving; everything in their tote for this kit
    // type goes away. So decrement by the sum of both sources.
    const completeHappened = job.customerKitsSyncedAt !== null;
    if (line.kit) {
      const fromTote = line.kitsFromTote;
      const completeAdded = completeHappened
        ? Math.max(0, lineQty - line.kitsFromTote)
        : 0;
      const totalKitDecrement = fromTote + completeAdded;
      if (totalKitDecrement > 0) {
        const componentDecrements = new Map<string, number>();
        for (const ki of line.kit.items) {
          // Use Math.ceil to match the rounding used by complete-job.ts's
          // snapshot materialization (Math.ceil). Mixed ceil/floor causes
          // fractional-recipe drift over time.
          const dec = Math.ceil(Number(ki.quantity) * totalKitDecrement);
          if (dec > 0) {
            componentDecrements.set(ki.itemId, dec);
          }
        }
        toteUpdates.push({
          kitId: line.kit.id,
          kitDecrement: totalKitDecrement,
          componentDecrements,
        });
        totalKitsRemovedFromTote += totalKitDecrement;
      }
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
      data: {
        currentStage: "DEACTIVATED",
        // Clear the COMPLETE-sync marker so if the job is later reverted
        // out of DEACTIVATED and back through to COMPLETE, the kit sync
        // re-runs (instead of no-op'ing because the flag is still set
        // from a prior completion that we just unwound).
        customerKitsSyncedAt: null,
      },
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
