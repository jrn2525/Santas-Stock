"use server";

import { revalidatePath } from "next/cache";
import type { InspectionDecision } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  assertRoleForAction,
  WRITE_ROLES,
  requireUser,
} from "@/lib/auth-helpers";

/**
 * Per-line inspection decisions.
 *
 * Inventory model — items leave the warehouse pool at allocation
 * (autoAllocateJob decrements Item.quantity by line.quantity at that point).
 * At inspection time the kit is physically back, so the per-decision
 * inventory deltas are:
 *
 * - GOOD: no change. Items stay deducted (they live with the customer's
 *   tote for next season; deactivation is the only path that restores
 *   them to the shared pool).
 * - DEAD: no change. The items were already deducted at allocation and
 *   they never came back, so net inventory is correct as-is. Recording
 *   the decision is purely for the audit trail / future Dead Inventory
 *   reporting.
 * - REPAIRED: deduct the user-specified repair quantity from the
 *   relevant item's inventory — those are fresh replacement parts being
 *   pulled out of the pool to swap into the returning kit. The broken
 *   originals stay deducted (they were lost at allocation, same as DEAD).
 *
 * Decisions can change. Previously-applied deltas are reversed before
 * the new ones are applied, so flipping any decision restores inventory
 * to the correct state. Existing DEAD decisions written under the old
 * (buggy) double-decrement logic are auto-healed the first time the
 * user touches them: the reversal of the old non-empty delta refunds
 * the over-deduction.
 *
 * Item lines store their decision in InspectionLineDecision.
 * Kit lines store one decision per component in InspectionComponentDecision.
 */

type Delta = { itemId: string; quantity: number };

export type ItemLineInput = {
  jobLineItemId: string;
  kind: "item";
  itemId: string;
  decision: InspectionDecision | null;
  /** Only used when decision === "REPAIRED". */
  repairQty?: number;
};

export type ComponentInput = {
  componentItemId: string;
  decision: InspectionDecision | null;
  /** Only used when decision === "REPAIRED". */
  repairQty?: number;
};

export type KitLineInput = {
  jobLineItemId: string;
  kind: "kit";
  components: ComponentInput[];
};

export type InspectionLineInput = ItemLineInput | KitLineInput;

function parseAppliedDeltas(raw: unknown): Delta[] {
  if (!Array.isArray(raw)) return [];
  const out: Delta[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const itemId = (row as { itemId?: unknown }).itemId;
    const quantity = (row as { quantity?: unknown }).quantity;
    if (typeof itemId === "string" && typeof quantity === "number") {
      out.push({ itemId, quantity });
    }
  }
  return out;
}

function computeNewDeltas(opts: {
  decision: InspectionDecision | null;
  itemId: string;
  repairQty?: number;
}): Delta[] {
  const { decision, itemId, repairQty } = opts;
  // DEAD and GOOD are both no-ops on inventory: items were already
  // deducted at allocation, and inspection doesn't return them to the
  // shared pool. Only REPAIRED moves inventory, by pulling fresh
  // replacement parts.
  if (decision === "REPAIRED") {
    const q = repairQty ?? 0;
    if (q <= 0) return [];
    return [{ itemId, quantity: Math.ceil(q) }];
  }
  return [];
}

export async function saveInspectionDecisions(
  jobId: string,
  inputs: InspectionLineInput[],
): Promise<void> {
  await assertRoleForAction(WRITE_ROLES);
  const user = await requireUser();

  // Load job title so we can drop a useful reason on any ReplacementQueue
  // rows we create as part of this save.
  const jobMeta = await prisma.jobberJob.findUnique({
    where: { id: jobId },
    select: { title: true, jobNumber: true },
  });
  const jobLabel =
    (jobMeta?.title ?? "(untitled job)") +
    (jobMeta?.jobNumber ? ` #${jobMeta.jobNumber}` : "");

  // Load every relevant line in one go with its existing decisions
  const lineIds = inputs.map((i) => i.jobLineItemId);
  const lines = await prisma.jobLineItem.findMany({
    where: { id: { in: lineIds }, jobId },
    include: {
      item: { select: { id: true } },
      kit: {
        include: {
          items: { select: { itemId: true, quantity: true } },
        },
      },
      inspectionDecision: true,
      componentDecisions: true,
    },
  });
  const linesById = new Map(lines.map((l) => [l.id, l]));

  // Net inventory adjustments by itemId. Positive = restore (increment),
  // negative = deduct (decrement).
  const netByItem = new Map<string, number>();
  const addNet = (itemId: string, change: number) => {
    netByItem.set(itemId, (netByItem.get(itemId) ?? 0) + change);
  };

  // ReplacementQueue writes — accumulated during the per-input pass and
  // written inside the same transaction at the end.
  type QueueWrite = {
    itemId: string;
    quantity: number;
    reason: string;
  };
  const queueWrites: QueueWrite[] = [];
  const flagForReplacement = (
    itemId: string,
    quantity: number,
    decision: InspectionDecision,
  ) => {
    if (quantity <= 0) return;
    const verb = decision === "DEAD" ? "Dead" : "Repaired";
    queueWrites.push({
      itemId,
      quantity,
      reason: `${verb} during inspection of ${jobLabel}`,
    });
  };

  // Track which decision records to upsert / delete
  type LineDecisionWrite = {
    jobLineItemId: string;
    decision: InspectionDecision;
    deltas: Delta[];
  };
  type ComponentDecisionWrite = {
    jobLineItemId: string;
    componentItemId: string;
    decision: InspectionDecision;
    deltas: Delta[];
  };
  const upsertLine: LineDecisionWrite[] = [];
  const deleteLineForLineIds: string[] = [];
  const upsertComponent: ComponentDecisionWrite[] = [];
  const deleteComponent: Array<{ jobLineItemId: string; componentItemId: string }> = [];
  const deleteAllComponentsForLineIds: string[] = [];

  for (const input of inputs) {
    const line = linesById.get(input.jobLineItemId);
    if (!line) continue;

    if (input.kind === "item") {
      // Reverse any existing line decision
      const existingDeltas = parseAppliedDeltas(
        line.inspectionDecision?.appliedDeltas,
      );
      for (const d of existingDeltas) addNet(d.itemId, d.quantity);
      // Defensively clean up any component decisions on this line
      if (line.componentDecisions.length > 0) {
        for (const cd of line.componentDecisions) {
          const oldDeltas = parseAppliedDeltas(cd.appliedDeltas);
          for (const d of oldDeltas) addNet(d.itemId, d.quantity);
        }
        deleteAllComponentsForLineIds.push(line.id);
      }

      const newDeltas =
        input.decision === null
          ? []
          : computeNewDeltas({
              decision: input.decision,
              itemId: input.itemId,
              repairQty: input.repairQty,
            });
      for (const d of newDeltas) addNet(d.itemId, -d.quantity);

      // Flag the item for replacement when this transitions INTO
      // DEAD or REPAIRED. Don't double-flag if the decision was
      // already DEAD or REPAIRED (re-save with same value).
      const oldItemDecision = line.inspectionDecision?.decision ?? null;
      if (
        (input.decision === "DEAD" || input.decision === "REPAIRED") &&
        oldItemDecision !== input.decision
      ) {
        const flagQty =
          input.decision === "DEAD"
            ? Math.ceil(Number(line.quantity))
            : Math.ceil(input.repairQty ?? 0);
        flagForReplacement(input.itemId, flagQty, input.decision);
      }

      if (input.decision === null) {
        if (line.inspectionDecision) {
          deleteLineForLineIds.push(line.id);
        }
      } else {
        upsertLine.push({
          jobLineItemId: line.id,
          decision: input.decision,
          deltas: newDeltas,
        });
      }
    } else {
      // KIT line — per-component decisions
      // Reverse any legacy line-level decision
      if (line.inspectionDecision) {
        const existingDeltas = parseAppliedDeltas(
          line.inspectionDecision.appliedDeltas,
        );
        for (const d of existingDeltas) addNet(d.itemId, d.quantity);
        deleteLineForLineIds.push(line.id);
      }

      // Build a map of existing component decisions for quick lookup
      const existingByComponentId = new Map(
        line.componentDecisions.map((cd) => [cd.componentItemId, cd]),
      );

      // Recipe component quantities (per-kit), needed when flagging a DEAD
      // component for replacement at line.quantity scale.
      const recipeByItemId = new Map(
        (line.kit?.items ?? []).map((ki) => [ki.itemId, Number(ki.quantity)]),
      );

      const seenComponentIds = new Set<string>();
      for (const comp of input.components) {
        seenComponentIds.add(comp.componentItemId);
        const existing = existingByComponentId.get(comp.componentItemId);
        if (existing) {
          const oldDeltas = parseAppliedDeltas(existing.appliedDeltas);
          for (const d of oldDeltas) addNet(d.itemId, d.quantity);
        }

        const newDeltas =
          comp.decision === null
            ? []
            : computeNewDeltas({
                decision: comp.decision,
                itemId: comp.componentItemId,
                repairQty: comp.repairQty,
              });
        for (const d of newDeltas) addNet(d.itemId, -d.quantity);

        // Flag the component for replacement on transition to DEAD or REPAIRED
        const oldCompDecision = existing?.decision ?? null;
        if (
          (comp.decision === "DEAD" || comp.decision === "REPAIRED") &&
          oldCompDecision !== comp.decision
        ) {
          const recipeQty = recipeByItemId.get(comp.componentItemId) ?? 0;
          const flagQty =
            comp.decision === "DEAD"
              ? Math.ceil(recipeQty * Number(line.quantity))
              : Math.ceil(comp.repairQty ?? 0);
          flagForReplacement(comp.componentItemId, flagQty, comp.decision);
        }

        if (comp.decision === null) {
          if (existing) {
            deleteComponent.push({
              jobLineItemId: line.id,
              componentItemId: comp.componentItemId,
            });
          }
        } else {
          upsertComponent.push({
            jobLineItemId: line.id,
            componentItemId: comp.componentItemId,
            decision: comp.decision,
            deltas: newDeltas,
          });
        }
      }

      // Any component decisions that previously existed but aren't in the
      // input — reverse + delete them too
      for (const existing of line.componentDecisions) {
        if (seenComponentIds.has(existing.componentItemId)) continue;
        const oldDeltas = parseAppliedDeltas(existing.appliedDeltas);
        for (const d of oldDeltas) addNet(d.itemId, d.quantity);
        deleteComponent.push({
          jobLineItemId: line.id,
          componentItemId: existing.componentItemId,
        });
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const [itemId, change] of netByItem.entries()) {
      if (change === 0) continue;
      await tx.item.update({
        where: { id: itemId },
        data: { quantity: { increment: change } },
      });
    }

    if (deleteLineForLineIds.length > 0) {
      await tx.inspectionLineDecision.deleteMany({
        where: { jobLineItemId: { in: deleteLineForLineIds } },
      });
    }
    for (const w of upsertLine) {
      await tx.inspectionLineDecision.upsert({
        where: { jobLineItemId: w.jobLineItemId },
        create: {
          jobLineItemId: w.jobLineItemId,
          decision: w.decision,
          appliedDeltas: w.deltas.length > 0 ? w.deltas : undefined,
          decidedByUserId: user.id,
        },
        update: {
          decision: w.decision,
          appliedDeltas: w.deltas.length > 0 ? w.deltas : undefined,
          decidedByUserId: user.id,
        },
      });
    }

    if (deleteAllComponentsForLineIds.length > 0) {
      await tx.inspectionComponentDecision.deleteMany({
        where: { jobLineItemId: { in: deleteAllComponentsForLineIds } },
      });
    }
    for (const d of deleteComponent) {
      await tx.inspectionComponentDecision.deleteMany({
        where: {
          jobLineItemId: d.jobLineItemId,
          componentItemId: d.componentItemId,
        },
      });
    }
    for (const w of upsertComponent) {
      await tx.inspectionComponentDecision.upsert({
        where: {
          jobLineItemId_componentItemId: {
            jobLineItemId: w.jobLineItemId,
            componentItemId: w.componentItemId,
          },
        },
        create: {
          jobLineItemId: w.jobLineItemId,
          componentItemId: w.componentItemId,
          decision: w.decision,
          appliedDeltas: w.deltas.length > 0 ? w.deltas : undefined,
          decidedByUserId: user.id,
        },
        update: {
          decision: w.decision,
          appliedDeltas: w.deltas.length > 0 ? w.deltas : undefined,
          decidedByUserId: user.id,
        },
      });
    }

    // Write any ReplacementQueue rows accumulated above
    for (const q of queueWrites) {
      await tx.replacementQueue.create({
        data: {
          itemId: q.itemId,
          quantity: q.quantity,
          reason: q.reason,
          flaggedByUserId: user.id,
        },
      });
    }
  });

  revalidatePath(`/job-flow/jobs/${jobId}/inspection`);
  revalidatePath(`/job-flow/jobs/${jobId}`);
  revalidatePath("/inventory/items");
  revalidatePath("/inventory/replacements");
}
