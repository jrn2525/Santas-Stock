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
 * Inventory deltas:
 * - GOOD: no change
 * - DEAD: deduct line.quantity (or componentQty * lineQty for kit components)
 *   from the relevant item's inventory permanently
 * - REPAIRED: deduct the user-specified repair quantity from the relevant
 *   item's inventory (pulled as replacement parts)
 *
 * Decisions can change. Previously-applied deltas are reversed before the
 * new ones are applied, so flipping Dead -> Good restores inventory.
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
  fullQty: number;
  repairQty?: number;
}): Delta[] {
  const { decision, itemId, fullQty, repairQty } = opts;
  if (decision === "DEAD") {
    return [{ itemId, quantity: Math.ceil(fullQty) }];
  }
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
    const lineQty = Number(line.quantity);

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
              fullQty: lineQty,
              repairQty: input.repairQty,
            });
      for (const d of newDeltas) addNet(d.itemId, -d.quantity);

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

      // Recipe quantities so we can compute DEAD deltas
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

        const recipeQty = recipeByItemId.get(comp.componentItemId) ?? 0;
        const fullQty = recipeQty * lineQty;
        const newDeltas =
          comp.decision === null
            ? []
            : computeNewDeltas({
                decision: comp.decision,
                itemId: comp.componentItemId,
                fullQty,
                repairQty: comp.repairQty,
              });
        for (const d of newDeltas) addNet(d.itemId, -d.quantity);

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
  });

  revalidatePath(`/job-flow/jobs/${jobId}/inspection`);
  revalidatePath(`/job-flow/jobs/${jobId}`);
  revalidatePath("/inventory/items");
}
