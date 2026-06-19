"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, ADMIN_ROLES } from "@/lib/auth-helpers";
import { resetJob } from "./reset-job";

export type StaleJobActionResult = { ok: boolean; message?: string };

/**
 * Delete a job that was removed from Jobber, returning everything it consumed
 * back to stock first. Two phases:
 *   1. resetJob() — atomically restores inventory pulled by allocation,
 *      inspection, and completion, and unwinds the customer-tote changes
 *      (the full "as imported" undo). This is the "release back to stock" the
 *      user asked for.
 *   2. Remove the job and its Jobber-sourced children. JobLineItem,
 *      ChangeOrder, and JobStageEvent cascade from the job; JobberVisit does
 *      not (no cascade) so we delete visits explicitly, and JobberNotes (which
 *      only SetNull on delete) are removed first so no orphans linger.
 *
 * ADMIN-only and guarded so it can only ever delete a job actually flagged as
 * deleted-in-Jobber — never a live one.
 */
export async function deleteStaleJob(
  jobId: string,
): Promise<StaleJobActionResult> {
  await assertRoleForAction(ADMIN_ROLES);

  const job = await prisma.jobberJob.findUnique({
    where: { id: jobId },
    select: { id: true, deletedInJobberAt: true },
  });
  if (!job) return { ok: true }; // already gone — nothing to do
  if (!job.deletedInJobberAt) {
    return { ok: false, message: "Job is still in Jobber — not deleting." };
  }

  try {
    // Phase 1: return all inventory and reset derived state.
    await resetJob(jobId, "RESET");

    // Phase 2: remove the job and its children.
    await prisma.$transaction(async (tx) => {
      await tx.jobberNote.deleteMany({
        where: { OR: [{ jobId }, { visit: { jobId } }] },
      });
      await tx.jobberVisit.deleteMany({ where: { jobId } });
      await tx.jobberJob.delete({ where: { id: jobId } });
    });
  } catch (err) {
    console.error(`[stale-jobs] delete ${jobId}:`, err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not delete the job.",
    };
  }

  revalidatePath("/job-flow/jobs");
  revalidatePath("/job-flow/calendar");
  revalidatePath("/job-flow/pick-list");
  revalidatePath("/job-flow/jobber");
  revalidatePath("/inventory/items");
  return { ok: true };
}

/**
 * "Stop showing this" — keep the job in Santa's Stock but hide it from the
 * review pop-up on future syncs. Reversed automatically if the job ever
 * reappears in Jobber (the sync clears the flag).
 */
export async function dismissStaleJob(
  jobId: string,
): Promise<StaleJobActionResult> {
  await assertRoleForAction(ADMIN_ROLES);

  await prisma.jobberJob.updateMany({
    where: { id: jobId, deletedInJobberAt: { not: null } },
    data: { staleDismissedAt: new Date() },
  });

  revalidatePath("/job-flow/jobber");
  return { ok: true };
}
