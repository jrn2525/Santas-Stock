"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, WRITE_ROLES } from "@/lib/auth-helpers";
import { runWithSyncLock } from "@/lib/jobber/sync-lock";
import { withJobLock } from "@/lib/job-lock";
import { resetJobCore } from "@/lib/reset-job-core";

export type StaleJobActionResult = { ok: boolean; message?: string };

/**
 * Delete a job that was removed from Jobber, returning everything it consumed
 * back to stock first. Two phases:
 *   1. resetJobCore() — atomically restores inventory pulled by allocation,
 *      inspection, and completion, and unwinds the customer-tote changes
 *      (the full "as imported" undo). This is the "release back to stock" the
 *      user asked for.
 *   2. Remove the job and its Jobber-sourced children. JobLineItem,
 *      ChangeOrder, and JobStageEvent cascade from the job; JobberVisit does
 *      not (no cascade) so we delete visits explicitly, and JobberNotes (which
 *      only SetNull on delete) are removed first so no orphans linger.
 *
 * Allowed for Admin and Manager (WRITE_ROLES) — deleting a job that Jobber has
 * already removed is routine cleanup, like the manager-allowed deactivation
 * flow. (The standalone hard-reset tool stays Admin-only.) Runs under the
 * shared sync lock so it can't race a concurrent sync re-upserting this job,
 * and re-checks the deleted-in-Jobber flag INSIDE the lock so it can only ever
 * delete a job still flagged deleted, never a live one.
 */
export async function deleteStaleJob(
  jobId: string,
): Promise<StaleJobActionResult> {
  await assertRoleForAction(WRITE_ROLES);

  const outcome = await runWithSyncLock(
    async (): Promise<StaleJobActionResult> =>
      // Also take the per-job lock (inside the sync lock) so the reset +
      // delete can't interleave with a concurrent allocate/change-order/
      // inspection on the same job, which serialize on withJobLock but not
      // on the sync lock. Sync lock is always the outer of the two, so the
      // ordering is consistent and can't deadlock.
      withJobLock(jobId, async (): Promise<StaleJobActionResult> => {
        // Re-read inside the lock so a sync that un-flagged the job (because
        // it reappeared in Jobber) between the click and here can't be deleted.
        const job = await prisma.jobberJob.findUnique({
          where: { id: jobId },
          select: { id: true, deletedInJobberAt: true },
        });
        if (!job) return { ok: true }; // already gone — nothing to do
        if (!job.deletedInJobberAt) {
          return {
            ok: false,
            message: "Job is still in Jobber — not deleting.",
          };
        }

        try {
          // Phase 1: return all inventory and reset derived state.
          await resetJobCore(jobId);

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
            message:
              err instanceof Error ? err.message : "Could not delete the job.",
          };
        }
        return { ok: true };
      }),
  );

  if (!outcome.ran) {
    return {
      ok: false,
      message: "A sync is running — give it a moment and try again.",
    };
  }

  if (outcome.value.ok) {
    revalidatePath("/job-flow/jobs");
    revalidatePath("/job-flow/calendar");
    revalidatePath("/job-flow/pick-list");
    revalidatePath("/job-flow/jobber");
    revalidatePath("/inventory/items");
  }
  return outcome.value;
}

/**
 * "Stop showing this" — keep the job in Santa's Stock but hide it from the
 * review pop-up on future syncs. Reversed automatically if the job ever
 * reappears in Jobber (the sync clears the flag).
 */
export async function dismissStaleJob(
  jobId: string,
): Promise<StaleJobActionResult> {
  await assertRoleForAction(WRITE_ROLES);

  await prisma.jobberJob.updateMany({
    where: { id: jobId, deletedInJobberAt: { not: null } },
    data: { staleDismissedAt: new Date() },
  });

  revalidatePath("/job-flow/jobber");
  return { ok: true };
}
