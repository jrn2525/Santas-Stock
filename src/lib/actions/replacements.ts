"use server";

import { revalidatePath } from "next/cache";
import type { ReplacementResolution } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  assertRoleForAction,
  WRITE_ROLES,
  requireUser,
} from "@/lib/auth-helpers";

/**
 * Mark a pending ReplacementQueue row as resolved. The user picks one
 * of REPAIR / REPLACE_FROM_STOCK / PURCHASE_ORDER; we stamp resolvedAt
 * and resolvedByUserId. Idempotent — re-resolving updates the
 * resolution but keeps the original resolvedAt.
 *
 * REPLACE_FROM_STOCK does NOT decrement inventory here. Inspection's
 * REPAIRED action already pulled the replacement parts at decision
 * time; this is purely an accounting marker for triage.
 */
export async function resolveReplacement(
  id: string,
  resolution: ReplacementResolution,
  poId?: string | null,
): Promise<void> {
  await assertRoleForAction(WRITE_ROLES);
  const user = await requireUser();

  const existing = await prisma.replacementQueue.findUnique({
    where: { id },
    select: { resolvedAt: true },
  });
  if (!existing) throw new Error("Replacement entry not found");

  await prisma.replacementQueue.update({
    where: { id },
    data: {
      resolution,
      poId: poId ?? null,
      resolvedAt: existing.resolvedAt ?? new Date(),
      resolvedByUserId: user.id,
    },
  });

  revalidatePath("/inventory/replacements");
}

/**
 * Re-open a previously-resolved entry. Sets resolution and resolvedAt
 * back to null. Useful when triage was applied incorrectly.
 */
export async function reopenReplacement(id: string): Promise<void> {
  await assertRoleForAction(WRITE_ROLES);

  await prisma.replacementQueue.update({
    where: { id },
    data: {
      resolution: null,
      poId: null,
      resolvedAt: null,
      resolvedByUserId: null,
    },
  });

  revalidatePath("/inventory/replacements");
}
