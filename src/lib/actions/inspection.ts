"use server";

import { revalidatePath } from "next/cache";
import type { InspectionDecision } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withJobLock } from "@/lib/job-lock";
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
  return withJobLock(jobId, () => doSaveInspectionDecisions(jobId, inputs));
}

async function doSaveInspectionDecisions(
  jobId: string,
  inputs: InspectionLineInput[],
): Promise<void> {
  await assertRoleForAction(WRITE_ROLES);
  const user = await requireUser();

  // Load job title so we can drop a useful reason on any ReplacementQueue
  // rows we create as part of this save. Also need clientId / propertyId
  // so we can find the customer's CustomerKit when adjusting tote
  // snapshots on DEAD decisions for tote-sourced kit lines.
  const jobMeta = await prisma.jobberJob.findUnique({
    where: { id: jobId },
    select: {
      title: true,
      jobNumber: true,
      clientId: true,
      propertyId: true,
    },
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
    jobLineItemId: string;
    itemId: string;
    quantity: number;
    reason: string;
  };
  const queueWrites: QueueWrite[] = [];
  const flagForReplacement = (
    jobLineItemId: string,
    itemId: string,
    quantity: number,
    decision: InspectionDecision,
  ) => {
    if (quantity <= 0) return;
    const verb = decision === "DEAD" ? "Dead" : "Repaired";
    queueWrites.push({
      jobLineItemId,
      itemId,
      quantity,
      reason: `${verb} during inspection of ${jobLabel}`,
    });
  };

  // CustomerKitItem snapshot adjustments. When a kit-component decision
  // transitions INTO or OUT OF DEAD on a tote-sourced kit line, the
  // customer's CustomerKitItem snapshot needs to track the gain/loss.
  // Keyed by (kitId, componentItemId) since the actual CustomerKit row
  // is resolved inside the transaction below.
  type ToteSnapshotDelta = {
    kitId: string;
    componentItemId: string;
    delta: number; // positive = restore, negative = remove
  };
  const toteDeltas: ToteSnapshotDelta[] = [];

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

      // Flag the item for replacement whenever it's currently DEAD or
      // REPAIRED. The job's unresolved queue rows are recomputed on save
      // (see the transaction below), so this reflects the latest quantity
      // without leaving stale rows behind.
      if (input.decision === "DEAD" || input.decision === "REPAIRED") {
        const flagQty =
          input.decision === "DEAD"
            ? Math.ceil(Number(line.quantity))
            : Math.ceil(input.repairQty ?? 0);
        flagForReplacement(line.id, input.itemId, flagQty, input.decision);
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

        const oldCompDecision = existing?.decision ?? null;
        // Flag the component for replacement whenever it's currently DEAD
        // or REPAIRED (the job's unresolved queue rows are recomputed on
        // save, so the quantity stays in sync).
        if (comp.decision === "DEAD" || comp.decision === "REPAIRED") {
          const recipeQty = recipeByItemId.get(comp.componentItemId) ?? 0;
          const flagQty =
            comp.decision === "DEAD"
              ? Math.ceil(recipeQty * Number(line.quantity))
              : Math.ceil(comp.repairQty ?? 0);
          flagForReplacement(
            line.id,
            comp.componentItemId,
            flagQty,
            comp.decision,
          );
        }

        // CustomerKit snapshot tracking. If this kit line was tote-
        // sourced (kitsFromTote > 0), a DEAD decision permanently
        // removes those components from the customer's tote snapshot;
        // reverting away from DEAD restores them. REPAIRED is a no-op
        // on count — broken units swap for fresh ones, total stays
        // the same. Computed off the recipe and kitsFromTote so the
        // delta is deterministic and reversal needs no stored state.
        if (line.kit && line.kitsFromTote > 0) {
          const recipeQty = recipeByItemId.get(comp.componentItemId) ?? 0;
          // Math.ceil matches complete-job.ts's snapshot materialization;
          // mixed ceil/floor across the lifecycle drifts fractional-recipe
          // snapshots upward over time.
          const snapshotImpact = Math.ceil(recipeQty * line.kitsFromTote);
          if (snapshotImpact > 0) {
            if (oldCompDecision === "DEAD" && comp.decision !== "DEAD") {
              // Reversal: components come back to the snapshot
              toteDeltas.push({
                kitId: line.kit.id,
                componentItemId: comp.componentItemId,
                delta: snapshotImpact,
              });
            } else if (
              oldCompDecision !== "DEAD" &&
              comp.decision === "DEAD"
            ) {
              // Application: components leave the snapshot
              toteDeltas.push({
                kitId: line.kit.id,
                componentItemId: comp.componentItemId,
                delta: -snapshotImpact,
              });
            }
          }
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

    // Recompute the unresolved replacement-queue rows for the touched
    // lines: drop the old auto-created ones, then write the current
    // decisions. Keeps quantities in sync when a repair qty changes and
    // removes rows when a decision is cleared. Resolved rows are preserved.
    await tx.replacementQueue.deleteMany({
      where: { jobLineItemId: { in: lineIds }, resolvedAt: null },
    });
    for (const q of queueWrites) {
      await tx.replacementQueue.create({
        data: {
          jobLineItemId: q.jobLineItemId,
          itemId: q.itemId,
          quantity: q.quantity,
          reason: q.reason,
          flaggedByUserId: user.id,
        },
      });
    }

    // Apply CustomerKitItem snapshot adjustments. For each (kitId,
    // componentItemId) pair, find the customer's CustomerKitItem and
    // apply the net delta (positive = restore, negative = remove,
    // clamped to >= 0).
    if (toteDeltas.length > 0 && jobMeta?.clientId) {
      // Net deltas by (kitId, componentItemId) so multiple decisions
      // on the same kit/component net out cleanly.
      const netByKey = new Map<string, ToteSnapshotDelta>();
      for (const d of toteDeltas) {
        const key = `${d.kitId}:${d.componentItemId}`;
        const existing = netByKey.get(key);
        if (existing) {
          existing.delta += d.delta;
        } else {
          netByKey.set(key, { ...d });
        }
      }

      // Group by kitId so we look up each CustomerKit row at most once
      const byKit = new Map<string, ToteSnapshotDelta[]>();
      for (const d of netByKey.values()) {
        const arr = byKit.get(d.kitId) ?? [];
        arr.push(d);
        byKit.set(d.kitId, arr);
      }

      for (const [kitId, deltas] of byKit) {
        const tote = await tx.customerKit.findFirst({
          where: {
            clientId: jobMeta.clientId,
            propertyId: jobMeta.propertyId ?? null,
            kitId,
          },
          select: { id: true },
        });
        if (!tote) continue;

        for (const d of deltas) {
          if (d.delta === 0) continue;
          const cki = await tx.customerKitItem.findUnique({
            where: {
              customerKitId_itemId: {
                customerKitId: tote.id,
                itemId: d.componentItemId,
              },
            },
          });
          if (!cki) {
            // Snapshot row doesn't exist (edge case — Year-1 line
            // that somehow got kitsFromTote > 0). Create if delta
            // is positive; otherwise skip.
            if (d.delta > 0) {
              await tx.customerKitItem.create({
                data: {
                  customerKitId: tote.id,
                  itemId: d.componentItemId,
                  quantity: d.delta,
                },
              });
            }
            continue;
          }
          const newQty = Math.max(0, cki.quantity + d.delta);
          await tx.customerKitItem.update({
            where: { id: cki.id },
            data: { quantity: newQty },
          });
        }
      }
    }
  });

  revalidatePath(`/job-flow/jobs/${jobId}/inspection`);
  revalidatePath(`/job-flow/jobs/${jobId}`);
  revalidatePath("/inventory/items");
  revalidatePath("/inventory/replacements");
}
