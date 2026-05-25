"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  assertRoleForAction,
  ADMIN_ROLES,
} from "@/lib/auth-helpers";
import { findCustomerKit } from "@/lib/customer-kit";

/**
 * Hard reset of a job back to its original imported state. Restricted
 * to ADMIN. Atomic — either every undo runs or none do.
 *
 * Unwinds, per the agreed scope:
 *  - Inventory pulled by allocation (per-line, net of recorded
 *    shortages, excluding the tote-sourced portion which never came
 *    from the pool).
 *  - Inventory pulled by inspection (REPAIRED replacements) via the
 *    stored appliedDeltas on InspectionLineDecision and
 *    InspectionComponentDecision.
 *  - Customer tote state: kits sourced from CustomerKit get their
 *    OUT_FOR_SEASON status restored to IN_STORAGE; kits added to the
 *    tote at COMPLETE (the fresh portion) get decremented out of
 *    CustomerKit.quantity, CustomerKit rows are deleted when their
 *    count hits zero (Prisma cascade cleans up the snapshot children).
 *  - CustomerKitItem snapshot changes: undoes the increments at
 *    COMPLETE (recipeQty * freshlyBuilt) and the decrements from
 *    Inspection DEAD on tote-sourced lines (recipeQty * kitsFromTote).
 *  - Decision records: InspectionLineDecision + InspectionComponentDecision
 *    rows for this job are deleted.
 *  - Shortages: JobLineShortage rows deleted.
 *  - Stage timeline: JobStageEvent rows deleted.
 *  - Job state: currentStage -> NEW, isOnHold -> false,
 *    customerKitsSyncedAt -> null.
 *  - Per-line flags: isAllocated -> false, kitsFromTote -> 0.
 *  - ChangeOrder rows for this job are deleted — their inventoryDeltas
 *    would otherwise claim deductions that the reset just unwound,
 *    making the audit log misleading. The reset takes the job back to
 *    "as imported," which means as if no change orders had ever fired.
 *
 * Intentionally NOT touched:
 *  - JobLineItem rows themselves (the pick list as it currently is
 *    survives; re-sync from Jobber to reset that too).
 *  - Client.customerStatus / firstCompletedAt (handled below — see
 *    customer-status revert step).
 *  - ReplacementQueue rows (no jobId FK to safely identify them).
 *
 * Throws if the confirmation token isn't exactly "RESET" so the action
 * can't be invoked accidentally from a server-action call site that
 * skips the UI confirmation flow.
 */
export async function resetJob(
  jobId: string,
  confirmation: string,
): Promise<{ itemRestores: number; kitsRestoredToTote: number }> {
  if (confirmation !== "RESET") {
    throw new Error(
      'Confirmation required. Pass "RESET" exactly to reset this job.',
    );
  }
  await assertRoleForAction(ADMIN_ROLES);

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
          inspectionDecision: true,
          componentDecisions: true,
          shortages: true,
        },
      },
    },
  });
  if (!job) throw new Error("Job not found");

  // ---- Build the inventory restoration plan ----
  // itemIncrements: itemId -> total units to add back to Item.quantity
  const itemIncrements = new Map<string, number>();
  const addInc = (itemId: string, qty: number) => {
    if (qty <= 0) return;
    itemIncrements.set(itemId, (itemIncrements.get(itemId) ?? 0) + qty);
  };

  // From inspection decisions — appliedDeltas holds exactly what was
  // deducted, so summing them with positive signs reverses cleanly.
  const parseDeltas = (raw: unknown): Array<{ itemId: string; quantity: number }> => {
    if (!Array.isArray(raw)) return [];
    const out: Array<{ itemId: string; quantity: number }> = [];
    for (const r of raw) {
      if (!r || typeof r !== "object") continue;
      const itemId = (r as { itemId?: unknown }).itemId;
      const quantity = (r as { quantity?: unknown }).quantity;
      if (typeof itemId === "string" && typeof quantity === "number") {
        out.push({ itemId, quantity });
      }
    }
    return out;
  };

  for (const line of job.lineItems) {
    if (line.inspectionDecision) {
      for (const d of parseDeltas(line.inspectionDecision.appliedDeltas)) {
        addInc(d.itemId, d.quantity);
      }
    }
    for (const cd of line.componentDecisions) {
      for (const d of parseDeltas(cd.appliedDeltas)) {
        addInc(d.itemId, d.quantity);
      }
    }
  }

  // From allocation per line. Take what allocation would have deducted
  // and subtract any recorded shortages (the portion that wasn't
  // actually pulled). Skip the tote-sourced portion (didn't come from
  // the shared pool).
  for (const line of job.lineItems) {
    if (!line.isAllocated) continue;

    const shortByItem = new Map<string, number>();
    for (const s of line.shortages) {
      shortByItem.set(
        s.itemId,
        (shortByItem.get(s.itemId) ?? 0) + s.quantityShort,
      );
    }

    const lineQty = Math.ceil(Number(line.quantity));
    const fromTote = line.kitsFromTote ?? 0;
    const fresh = Math.max(0, lineQty - fromTote);

    if (line.item) {
      const needed = lineQty;
      const short = shortByItem.get(line.item.id) ?? 0;
      addInc(line.item.id, Math.max(0, needed - short));
    } else if (line.kit && fresh > 0) {
      for (const ki of line.kit.items) {
        const needed = Math.ceil(Number(ki.quantity) * fresh);
        const short = shortByItem.get(ki.itemId) ?? 0;
        addInc(ki.itemId, Math.max(0, needed - short));
      }
    }
  }

  // ---- Build the CustomerKit / CustomerKitItem plan ----
  type CkPlan = {
    kitId: string;
    kitQuantityDelta: number; // signed: negative = decrement
    restoreStatus: boolean;
    componentDeltas: Map<string, number>; // itemId -> signed delta
  };
  const ckPlans = new Map<string, CkPlan>();
  const ckPlan = (kitId: string): CkPlan => {
    let p = ckPlans.get(kitId);
    if (!p) {
      p = {
        kitId,
        kitQuantityDelta: 0,
        restoreStatus: false,
        componentDeltas: new Map(),
      };
      ckPlans.set(kitId, p);
    }
    return p;
  };
  const addCompDelta = (plan: CkPlan, itemId: string, delta: number) => {
    if (delta === 0) return;
    plan.componentDeltas.set(
      itemId,
      (plan.componentDeltas.get(itemId) ?? 0) + delta,
    );
  };

  const completeHappened = job.customerKitsSyncedAt !== null;

  for (const line of job.lineItems) {
    if (!line.kit) continue;
    const kitId = line.kit.id;
    const lineQty = Math.ceil(Number(line.quantity));
    const fromTote = line.kitsFromTote ?? 0;
    const fresh = Math.max(0, lineQty - fromTote);
    const plan = ckPlan(kitId);

    if (fromTote > 0) {
      plan.restoreStatus = true;
    }

    if (completeHappened) {
      // Undo COMPLETE additions: fresh kits + their materialized
      // component snapshot increments.
      plan.kitQuantityDelta -= fresh;
      for (const ki of line.kit.items) {
        const added = Math.ceil(Number(ki.quantity) * fresh);
        addCompDelta(plan, ki.itemId, -added);
      }
    }

    // Undo Inspection DEAD decrements on tote-sourced kit components.
    if (fromTote > 0) {
      for (const compDec of line.componentDecisions) {
        if (compDec.decision !== "DEAD") continue;
        const recipe = line.kit.items.find(
          (ki) => ki.itemId === compDec.componentItemId,
        );
        if (!recipe) continue;
        // Math.ceil matches the inspection.ts and complete-job.ts
        // rounding so the reset exactly mirrors the original
        // snapshot decrement. Mixed ceil/floor would leave the
        // CustomerKitItem with stray fractional residue.
        const decremented = Math.ceil(Number(recipe.quantity) * fromTote);
        addCompDelta(plan, compDec.componentItemId, decremented);
      }
    }
  }

  // ---- Apply everything inside one transaction ----
  let kitsRestoredToTote = 0;

  await prisma.$transaction(async (tx) => {
    // Item quantity increments
    for (const [itemId, qty] of itemIncrements) {
      if (qty <= 0) continue;
      await tx.item.update({
        where: { id: itemId },
        data: { quantity: { increment: qty } },
      });
    }

    // CustomerKit / CustomerKitItem updates
    for (const plan of ckPlans.values()) {
      const tote = await findCustomerKit(tx, {
        clientId: job.clientId,
        propertyId: job.propertyId ?? null,
        kitId: plan.kitId,
      });
      if (!tote) continue;

      const newQty = Math.max(0, tote.quantity + plan.kitQuantityDelta);

      if (plan.restoreStatus) {
        kitsRestoredToTote++;
      }

      if (newQty === 0) {
        // Cascade deletes the snapshot children — no need to touch them
        await tx.customerKit.delete({ where: { id: tote.id } });
        continue;
      }

      // Apply per-component snapshot adjustments
      for (const [itemId, delta] of plan.componentDeltas) {
        if (delta === 0) continue;
        const cki = await tx.customerKitItem.findUnique({
          where: {
            customerKitId_itemId: {
              customerKitId: tote.id,
              itemId,
            },
          },
        });
        if (!cki) {
          if (delta > 0) {
            await tx.customerKitItem.create({
              data: {
                customerKitId: tote.id,
                itemId,
                quantity: delta,
              },
            });
          }
          continue;
        }
        const newSnap = Math.max(0, cki.quantity + delta);
        if (newSnap === 0) {
          await tx.customerKitItem.delete({ where: { id: cki.id } });
        } else {
          await tx.customerKitItem.update({
            where: { id: cki.id },
            data: { quantity: newSnap },
          });
        }
      }

      await tx.customerKit.update({
        where: { id: tote.id },
        data: {
          quantity: newQty,
          status: "IN_STORAGE",
        },
      });
    }

    // Delete inspection decision records (both line + component)
    await tx.inspectionLineDecision.deleteMany({
      where: { jobLineItem: { jobId } },
    });
    await tx.inspectionComponentDecision.deleteMany({
      where: { jobLineItem: { jobId } },
    });

    // Delete shortages
    await tx.jobLineShortage.deleteMany({
      where: { jobLineItem: { jobId } },
    });

    // Wipe stage timeline
    await tx.jobStageEvent.deleteMany({ where: { jobId } });

    // Wipe ChangeOrder rows for this job. Their inventoryDeltas JSON
    // describes deductions that the reset just put back; keeping the
    // log entries would make them lie. The job goes back to "as
    // imported," which is pre-any-change-orders.
    await tx.changeOrder.deleteMany({ where: { jobId } });

    // Reset per-line flags
    await tx.jobLineItem.updateMany({
      where: { jobId },
      data: { isAllocated: false, kitsFromTote: 0 },
    });

    // Reset the job itself
    await tx.jobberJob.update({
      where: { id: jobId },
      data: {
        currentStage: "NEW",
        isOnHold: false,
        customerKitsSyncedAt: null,
      },
    });

    // Customer-status revert. Always check the client's other jobs at
    // reset time, regardless of whether THIS job's customerKitsSyncedAt
    // was set. A job is treated as "completed" if either:
    //   - currentStage === "COMPLETE" (it sits at the Ready terminal), or
    //   - customerKitsSyncedAt is non-null (Cut 1+ marker that it
    //     contributed to the customer becoming EXISTING).
    // Using either criterion catches legacy data from before Cut 1
    // landed, when customerKitsSyncedAt didn't exist yet but the
    // customer was still flipped to EXISTING when a job hit COMPLETE.
    //   - No other completed jobs -> flip customerStatus back to NEW
    //     and clear firstCompletedAt. The Existing badge disappears.
    //   - One or more -> the client legitimately IS existing via
    //     those other completions; leave customerStatus alone but
    //     recompute firstCompletedAt to the earliest remaining
    //     completion date so the badge tooltip reflects reality.
    {
      const otherCompleted = await tx.jobberJob.findMany({
        where: {
          clientId: job.clientId,
          id: { not: jobId },
          OR: [
            { currentStage: "COMPLETE" },
            { customerKitsSyncedAt: { not: null } },
          ],
        },
        select: { customerKitsSyncedAt: true, createdAt: true },
        orderBy: { customerKitsSyncedAt: "asc" },
      });
      if (otherCompleted.length === 0) {
        await tx.client.update({
          where: { id: job.clientId },
          data: {
            customerStatus: "NEW",
            firstCompletedAt: null,
          },
        });
      } else {
        // Compute the true earliest "completed-at" across remaining
        // jobs. Postgres ASC sorts NULLs last, so we can't rely on
        // orderBy alone — pre-Cut-1 legacy completed jobs have
        // customerKitsSyncedAt=null and would land at the end of the
        // sort even if they're chronologically older than the
        // post-Cut-1 rows. Fall back to createdAt for legacy rows,
        // then min across all of them in app code.
        let earliest: Date | null = null;
        for (const j of otherCompleted) {
          const t = j.customerKitsSyncedAt ?? j.createdAt;
          if (earliest === null || t.getTime() < earliest.getTime()) {
            earliest = t;
          }
        }
        await tx.client.update({
          where: { id: job.clientId },
          data: { firstCompletedAt: earliest },
        });
      }
    }
  });

  revalidatePath(`/job-flow/jobs/${jobId}`);
  revalidatePath(`/job-flow/jobs/${jobId}/awaiting-stock`);
  revalidatePath(`/job-flow/jobs/${jobId}/inspection`);
  revalidatePath(`/job-flow/jobs/${jobId}/deactivate`);
  revalidatePath("/job-flow/jobs");
  revalidatePath("/inventory/items");
  revalidatePath("/inventory/dead-stock");

  return {
    itemRestores: itemIncrements.size,
    kitsRestoredToTote,
  };
}
