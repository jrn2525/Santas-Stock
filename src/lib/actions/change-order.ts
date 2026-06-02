"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withJobLock } from "@/lib/job-lock";
import { deductStock } from "@/lib/stock";
import { assertRoleForAction, WRITE_ROLES, requireUser } from "@/lib/auth-helpers";

/**
 * Edit a Job's pick list. Adds, removes, and quantity changes are all
 * applied as a single Change Order, with inventory adjusted accordingly.
 *
 * The caller submits the FULL desired state of the pick list (the editor
 * sends the new list, not a diff). The server computes the diff against
 * the current state, applies the net inventory delta, replaces the
 * JobLineItem rows, and writes a ChangeOrder log entry.
 */

export type ChangeOrderLineInput = {
  /** Existing JobLineItem id if this row carries over from before; omitted for additions. */
  id?: string;
  kind: "item" | "kit";
  /** itemId or kitId depending on kind. */
  refId: string;
  quantity: number;
};

export type ChangeOrderResult = {
  ok: true;
  added: number;
  removed: number;
  changed: number;
  shortagesCreated: number;
};

export async function applyChangeOrder(
  jobId: string,
  newLines: ChangeOrderLineInput[],
  reason: string | null,
): Promise<ChangeOrderResult> {
  return withJobLock(jobId, () => doApplyChangeOrder(jobId, newLines, reason));
}

async function doApplyChangeOrder(
  jobId: string,
  newLines: ChangeOrderLineInput[],
  reason: string | null,
): Promise<ChangeOrderResult> {
  await assertRoleForAction(WRITE_ROLES);
  const user = await requireUser();

  const job = await prisma.jobberJob.findUnique({
    where: { id: jobId },
    select: { id: true, currentStage: true },
  });
  if (!job) throw new Error("Job not found");

  // Read full current state including kit recipes (for inventory math)
  const currentLines = await prisma.jobLineItem.findMany({
    where: { jobId },
    include: {
      item: { select: { id: true, name: true, quantity: true } },
      kit: {
        include: {
          items: {
            include: { item: { select: { id: true, name: true, quantity: true } } },
          },
        },
      },
      shortages: true,
    },
  });

  // Build "previouslyDeducted" map: itemId -> qty that was actually pulled
  // from inventory on this job. For each allocated line, the deducted amount
  // is (FRESH portion * componentQty) - sumOfShortagesForThisItem, where
  // FRESH = lineQty - kitsFromTote. The tote-sourced portion of a Year-2
  // line never touched the shared pool, so it must be excluded from the
  // diff math — otherwise Change Order would refund tote-sourced
  // components that were never deducted.
  const previouslyDeducted = new Map<string, number>();
  for (const line of currentLines) {
    if (!line.isAllocated) continue;
    const lineQty = Math.ceil(Number(line.quantity));
    const fresh = Math.max(0, lineQty - line.kitsFromTote);
    const shortagesByItem = new Map<string, number>();
    for (const s of line.shortages) {
      shortagesByItem.set(s.itemId, (shortagesByItem.get(s.itemId) ?? 0) + s.quantityShort);
    }
    if (line.item) {
      const need = lineQty;
      const short = shortagesByItem.get(line.item.id) ?? 0;
      const deducted = Math.max(0, need - short);
      previouslyDeducted.set(
        line.item.id,
        (previouslyDeducted.get(line.item.id) ?? 0) + deducted,
      );
    } else if (line.kit && fresh > 0) {
      for (const ki of line.kit.items) {
        const need = Math.ceil(Number(ki.quantity) * fresh);
        const short = shortagesByItem.get(ki.item.id) ?? 0;
        const deducted = Math.max(0, need - short);
        previouslyDeducted.set(
          ki.item.id,
          (previouslyDeducted.get(ki.item.id) ?? 0) + deducted,
        );
      }
    }
  }

  // Resolve the new lines: fetch each Item or Kit for recipe expansion + names.
  const itemIds = newLines.filter((l) => l.kind === "item").map((l) => l.refId);
  const kitIds = newLines.filter((l) => l.kind === "kit").map((l) => l.refId);
  const [itemsById, kitsById] = await Promise.all([
    prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, name: true, quantity: true },
    }),
    prisma.kit.findMany({
      where: { id: { in: kitIds } },
      include: {
        items: {
          include: { item: { select: { id: true, name: true, quantity: true } } },
        },
      },
    }),
  ]);
  const itemMap = new Map(itemsById.map((i) => [i.id, i]));
  const kitMap = new Map(kitsById.map((k) => [k.id, k]));

  // Map of existing JobLineItem id -> kitsFromTote, so we can preserve
  // the tote-tracking on lines that carry over with the same existingId.
  // Lines without an existingId are genuinely new (or are item lines
  // decomposed from a customized kit) and start with kitsFromTote=0.
  const existingKitsFromToteById = new Map<string, number>();
  for (const line of currentLines) {
    existingKitsFromToteById.set(line.id, line.kitsFromTote);
  }
  // Clamp helper: kitsFromTote can never exceed the line's new quantity.
  const carriedKitsFromTote = (
    inputLineId: string | undefined,
    newQty: number,
  ): number => {
    if (!inputLineId) return 0;
    const prior = existingKitsFromToteById.get(inputLineId) ?? 0;
    return Math.min(prior, newQty);
  };

  // Compute "newNeeded" map: itemId -> qty needed for the new pick list
  // state. For kit lines, only the FRESH portion (newQty - carried-over
  // kitsFromTote) draws from the shared pool. Without this subtraction, a
  // change order that leaves a Year-2 kit line at the same quantity would
  // generate a non-zero diff (because previouslyDeducted excluded tote
  // but newNeeded would include it).
  const newNeeded = new Map<string, number>();
  for (const line of newLines) {
    const qty = Math.ceil(Number(line.quantity));
    if (qty <= 0) continue;
    if (line.kind === "item") {
      const it = itemMap.get(line.refId);
      if (!it) throw new Error(`Unknown item ${line.refId}`);
      newNeeded.set(it.id, (newNeeded.get(it.id) ?? 0) + qty);
    } else {
      const k = kitMap.get(line.refId);
      if (!k) throw new Error(`Unknown kit ${line.refId}`);
      const fromTote = carriedKitsFromTote(line.id, qty);
      const fresh = qty - fromTote;
      if (fresh <= 0) continue;
      for (const ki of k.items) {
        const need = Math.ceil(Number(ki.quantity) * fresh);
        newNeeded.set(ki.item.id, (newNeeded.get(ki.item.id) ?? 0) + need);
      }
    }
  }

  // Compute net diff per item: positive = need to pull more; negative = return some
  const itemIdsAffected = new Set<string>([
    ...previouslyDeducted.keys(),
    ...newNeeded.keys(),
  ]);
  const netDiff = new Map<string, number>();
  for (const id of itemIdsAffected) {
    const prev = previouslyDeducted.get(id) ?? 0;
    const now = newNeeded.get(id) ?? 0;
    netDiff.set(id, now - prev);
  }

  // Build human-readable diff summary for the ChangeOrder log
  type NameKind = { name: string; kind: "item" | "kit"; quantity: number };
  type Changed = { name: string; kind: "item" | "kit"; fromQty: number; toQty: number };
  const oldByRef = new Map<string, { kind: "item" | "kit"; name: string; quantity: number }>();
  for (const line of currentLines) {
    const ref = line.itemId ?? line.kitId;
    if (!ref) continue;
    oldByRef.set(ref, {
      kind: line.kitId ? "kit" : "item",
      name: line.kit?.name ?? line.item?.name ?? line.rawName ?? "(unknown)",
      quantity: Number(line.quantity),
    });
  }
  const newByRef = new Map<string, { kind: "item" | "kit"; name: string; quantity: number }>();
  for (const line of newLines) {
    const name =
      line.kind === "kit"
        ? kitMap.get(line.refId)?.name ?? "(unknown kit)"
        : itemMap.get(line.refId)?.name ?? "(unknown item)";
    newByRef.set(line.refId, { kind: line.kind, name, quantity: line.quantity });
  }
  const added: NameKind[] = [];
  const removed: NameKind[] = [];
  const changed: Changed[] = [];
  for (const [ref, n] of newByRef.entries()) {
    const old = oldByRef.get(ref);
    if (!old) {
      added.push({ name: n.name, kind: n.kind, quantity: n.quantity });
    } else if (old.quantity !== n.quantity) {
      changed.push({
        name: n.name,
        kind: n.kind,
        fromQty: old.quantity,
        toQty: n.quantity,
      });
    }
  }
  for (const [ref, old] of oldByRef.entries()) {
    if (!newByRef.has(ref)) {
      removed.push({ name: old.name, kind: old.kind, quantity: old.quantity });
    }
  }

  // Apply everything in a single transaction
  let shortagesCreated = 0;
  const inventoryDeltas: { itemName: string; change: number }[] = [];
  const shortageByItem = new Map<string, number>();

  await prisma.$transaction(async (tx) => {
    // 1. Apply net inventory deltas. Track per-item shortages here so we can
    // attribute them to specific lines after the new JobLineItem rows exist.
    for (const [itemId, diff] of netDiff.entries()) {
      if (diff === 0) continue;
      const item =
        itemMap.get(itemId) ??
        (await tx.item.findUnique({
          where: { id: itemId },
          select: { id: true, name: true, quantity: true },
        }));
      if (!item) continue;
      if (diff < 0) {
        await tx.item.update({
          where: { id: itemId },
          data: { quantity: { increment: -diff } },
        });
        inventoryDeltas.push({ itemName: item.name, change: diff });
      } else {
        const toDeduct = await deductStock(tx, itemId, diff);
        const short = diff - toDeduct;
        if (toDeduct > 0) {
          inventoryDeltas.push({ itemName: item.name, change: toDeduct });
        }
        if (short > 0) {
          shortagesCreated += short;
          shortageByItem.set(itemId, short);
        }
      }
    }

    // 2. Reconcile JobLineItem rows. We can't blanket-delete and recreate
    // because that destroys per-line metadata (kitsFromTote, inspection
    // decision children, prior shortages). Instead:
    //   - Lines with an `id` in the input that match a current row:
    //     UPDATE in place. Preserve kitsFromTote (clamped to newQty).
    //   - Lines without an `id`, or with an `id` that doesn't match:
    //     CREATE as fresh.
    //   - Current rows whose id isn't in the input: DELETE.
    //     Inspection decisions and shortages still cascade away via the
    //     schema onDelete rules.
    const surviveIds = new Set<string>();
    for (const l of newLines) {
      if (l.id && existingKitsFromToteById.has(l.id)) surviveIds.add(l.id);
    }
    const toDelete = currentLines
      .filter((cl) => !surviveIds.has(cl.id))
      .map((cl) => cl.id);
    if (toDelete.length > 0) {
      await tx.jobLineItem.deleteMany({ where: { id: { in: toDelete } } });
    }
    for (let i = 0; i < newLines.length; i++) {
      const line = newLines[i];
      const newQty = Math.ceil(Number(line.quantity));
      if (line.id && existingKitsFromToteById.has(line.id)) {
        const carriedFromTote =
          line.kind === "kit" ? carriedKitsFromTote(line.id, newQty) : 0;
        await tx.jobLineItem.update({
          where: { id: line.id },
          data: {
            itemId: line.kind === "item" ? line.refId : null,
            kitId: line.kind === "kit" ? line.refId : null,
            quantity: line.quantity,
            position: i,
            isAllocated: true,
            kitsFromTote: carriedFromTote,
          },
        });
      } else {
        await tx.jobLineItem.create({
          data: {
            jobId,
            itemId: line.kind === "item" ? line.refId : null,
            kitId: line.kind === "kit" ? line.refId : null,
            quantity: line.quantity,
            position: i,
            isAllocated: true,
            kitsFromTote: 0,
          },
        });
      }
    }

    // 2b. For kit lines that were FULLY removed (the kit type no longer
    // appears anywhere in the new pick list), restore the customer's
    // CustomerKit status to IN_STORAGE. The tote contents themselves
    // don't change — the customer keeps the kit, this job just no longer
    // claims it. Quantity decrement happens at deactivation, not here.
    const removedKitIds = currentLines
      .filter(
        (cl) =>
          cl.kit !== null &&
          cl.kitsFromTote > 0 &&
          !surviveIds.has(cl.id) &&
          // No remaining (surviving or new) line still references this kit
          !newLines.some(
            (nl) => nl.kind === "kit" && nl.refId === cl.kit?.id,
          ),
      )
      .map((cl) => cl.kit!.id);
    if (removedKitIds.length > 0) {
      // Look up the JobberJob's client + property once for the tote query
      const jobMeta = await tx.jobberJob.findUnique({
        where: { id: jobId },
        select: { clientId: true, propertyId: true },
      });
      if (jobMeta) {
        for (const kitId of removedKitIds) {
          const tote = await tx.customerKit.findFirst({
            where: {
              clientId: jobMeta.clientId,
              propertyId: jobMeta.propertyId ?? null,
              kitId,
            },
            select: { id: true },
          });
          if (tote) {
            await tx.customerKit.update({
              where: { id: tote.id },
              data: { status: "IN_STORAGE" },
            });
          }
        }
      }
    }

    // 3. Attribute each shortage to a line that uses that item (directly
    // or as a kit component). First match wins — good enough for v1; if
    // multiple lines share the same shortage we just pick one.
    if (shortageByItem.size > 0) {
      const createdLines = await tx.jobLineItem.findMany({
        where: { jobId },
        select: { id: true, itemId: true, kitId: true },
      });
      for (const [itemId, short] of shortageByItem.entries()) {
        const line = createdLines.find((l) => {
          if (l.itemId === itemId) return true;
          const kit = kitMap.get(l.kitId ?? "");
          return kit?.items.some((ki) => ki.item.id === itemId) ?? false;
        });
        if (line) {
          await tx.jobLineShortage.create({
            data: {
              jobLineItemId: line.id,
              itemId,
              quantityShort: short,
            },
          });
        }
      }
    }

    // 4. Flip isOnHold based on whether any shortages exist now
    await tx.jobberJob.update({
      where: { id: jobId },
      data: { isOnHold: shortagesCreated > 0 },
    });

    // 5. Write the ChangeOrder log entry
    await tx.changeOrder.create({
      data: {
        jobId,
        atStage: job.currentStage,
        reason: reason && reason.trim().length > 0 ? reason.trim() : null,
        createdById: user.id,
        diff: {
          added,
          removed,
          changed,
          inventoryDeltas,
        } as Prisma.InputJsonValue,
      },
    });
  });

  revalidatePath(`/job-flow/jobs/${jobId}`);
  revalidatePath(`/job-flow/jobs/${jobId}/change-order`);
  revalidatePath(`/job-flow/jobs/${jobId}/awaiting-stock`);
  revalidatePath("/inventory/items");

  return {
    ok: true,
    added: added.length,
    removed: removed.length,
    changed: changed.length,
    shortagesCreated,
  };
}
