"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, WRITE_ROLES } from "@/lib/auth-helpers";

export type ServiceCallActionResult = { ok: boolean; message?: string };

function revalidateServiceCall(jobId?: string) {
  if (jobId) revalidatePath(`/job-flow/jobs/${jobId}`);
  revalidatePath("/job-flow/jobs");
  revalidatePath("/job-flow/completed-jobs");
}

/**
 * Mark a Service Call job "Completed Service Call": it leaves the Jobs list and
 * moves to Completed Jobs. Admin + Manager.
 */
export async function completeServiceCall(
  jobId: string,
): Promise<ServiceCallActionResult> {
  await assertRoleForAction(WRITE_ROLES);
  try {
    await prisma.jobberJob.update({
      where: { id: jobId },
      data: { serviceCallCompletedAt: new Date() },
    });
  } catch (err) {
    console.error(`[service-call] complete ${jobId}:`, err);
    return { ok: false, message: "Could not complete the service call." };
  }
  revalidateServiceCall(jobId);
  return { ok: true };
}

/** Reopen a completed service call — it returns to the Jobs list. */
export async function reopenServiceCall(
  jobId: string,
): Promise<ServiceCallActionResult> {
  await assertRoleForAction(WRITE_ROLES);
  try {
    await prisma.jobberJob.update({
      where: { id: jobId },
      data: { serviceCallCompletedAt: null },
    });
  } catch (err) {
    console.error(`[service-call] reopen ${jobId}:`, err);
    return { ok: false, message: "Could not reopen the service call." };
  }
  revalidateServiceCall(jobId);
  return { ok: true };
}

/**
 * Delete the given completed service-call jobs from the Completed Jobs list.
 * Only jobs actually marked completed are removed. Each is tombstoned by its
 * Jobber id so a future sync won't re-import it while it still lives in Jobber.
 * Service calls are labor-only, so there's no inventory to release. Admin +
 * Manager.
 */
export async function deleteCompletedJobs(
  jobIds: string[],
): Promise<ServiceCallActionResult> {
  await assertRoleForAction(WRITE_ROLES);
  if (jobIds.length === 0) return { ok: true };

  const jobs = await prisma.jobberJob.findMany({
    where: { id: { in: jobIds }, serviceCallCompletedAt: { not: null } },
    select: { id: true, jobberJobId: true },
  });

  try {
    for (const job of jobs) {
      await prisma.$transaction(async (tx) => {
        // Remember it so the Jobs sync won't re-import it.
        await tx.jobTombstone.upsert({
          where: { jobberJobId: job.jobberJobId },
          update: {},
          create: { jobberJobId: job.jobberJobId },
        });
        // Notes SetNull on delete; remove them (and visit notes) first so no
        // orphans linger. Visits have no cascade — delete them explicitly.
        await tx.jobberNote.deleteMany({
          where: { OR: [{ jobId: job.id }, { visit: { jobId: job.id } }] },
        });
        await tx.jobberVisit.deleteMany({ where: { jobId: job.id } });
        // Line items / change orders / stage events cascade from the job.
        await tx.jobberJob.delete({ where: { id: job.id } });
      });
    }
  } catch (err) {
    console.error("[service-call] delete completed jobs:", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Could not delete.",
    };
  }

  revalidateServiceCall();
  return { ok: true };
}
