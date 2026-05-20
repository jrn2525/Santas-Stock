"use server";

import { revalidatePath } from "next/cache";
import { InspectionDecision } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, WRITE_ROLES, requireUser } from "@/lib/auth-helpers";

/**
 * Per-line inspection decision: Good / Repaired / Dead.
 *
 * Inventory deltas applied per decision:
 * - GOOD: no change
 * - DEAD (item line): -line.quantity from the item's inventory
 * - DEAD (kit line): -component.quantity * line.quantity from each
 *   component item's inventory (the whole kit is scrapped)
 * - REPAIRED: -repairParts[i].quantity from each item the user is
 *   replacing during repair (called "allocated to kit" in the design —
 *   they leave inventory and become part of the customer's kit)
 *
 * Decisions can change. The previously-applied deltas are reversed before
 * the new ones are applied, so flipping Dead -> Good restores inventory.
 */

type Delta = { itemId: string; quantity: number };

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

async function computeDeltasForDead(jobLineItemId: string): Promise<Delta[]> {
  const line = await prisma.jobLineItem.findUnique({
    where: { id: jobLineItemId },
    include: {
      item: { select: { id: true } },
      kit: {
        include: {
          items: {
            select: { itemId: true, quantity: true },
          },
        },
      },
    },
  });
  if (!line) return [];

  const lineQty = Number(line.quantity);

  if (line.item) {
    return [{ itemId: line.item.id, quantity: Math.ceil(lineQty) }];
  }
  if (line.kit) {
    return line.kit.items.map((ki) => ({
      itemId: ki.itemId,
      quantity: Math.ceil(Number(ki.quantity) * lineQty),
    }));
  }
  return [];
}

export async function setInspectionDecision(
  jobLineItemId: string,
  decision: InspectionDecision,
  repairParts?: Delta[],
): Promise<void> {
  await assertRoleForAction(WRITE_ROLES);
  const user = await requireUser();

  const line = await prisma.jobLineItem.findUnique({
    where: { id: jobLineItemId },
    select: { id: true, jobId: true },
  });
  if (!line) throw new Error("Line not found");

  const existing = await prisma.inspectionLineDecision.findUnique({
    where: { jobLineItemId },
    select: { appliedDeltas: true },
  });
  const previousDeltas = parseAppliedDeltas(existing?.appliedDeltas);

  let newDeltas: Delta[] = [];
  if (decision === "DEAD") {
    newDeltas = await computeDeltasForDead(jobLineItemId);
  } else if (decision === "REPAIRED") {
    newDeltas = (repairParts ?? []).filter(
      (d) => d.quantity > 0 && d.itemId.length > 0,
    );
  }

  // Net the deltas so we issue one update per item: (-new) + (+previous)
  const netByItem = new Map<string, number>();
  for (const d of previousDeltas) {
    netByItem.set(d.itemId, (netByItem.get(d.itemId) ?? 0) + d.quantity);
  }
  for (const d of newDeltas) {
    netByItem.set(d.itemId, (netByItem.get(d.itemId) ?? 0) - d.quantity);
  }

  await prisma.$transaction(async (tx) => {
    for (const [itemId, change] of netByItem.entries()) {
      if (change === 0) continue;
      await tx.item.update({
        where: { id: itemId },
        data: { quantity: { increment: change } },
      });
    }

    await tx.inspectionLineDecision.upsert({
      where: { jobLineItemId },
      create: {
        jobLineItemId,
        decision,
        appliedDeltas: newDeltas.length > 0 ? newDeltas : undefined,
        decidedByUserId: user.id,
      },
      update: {
        decision,
        appliedDeltas: newDeltas.length > 0 ? newDeltas : undefined,
        decidedByUserId: user.id,
      },
    });
  });

  revalidatePath(`/job-flow/jobs/${line.jobId}/inspection`);
  revalidatePath(`/job-flow/jobs/${line.jobId}`);
  revalidatePath("/inventory/items");
}
