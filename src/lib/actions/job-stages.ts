"use server";

import { revalidatePath } from "next/cache";
import type { JobStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, WRITE_ROLES, requireUser } from "@/lib/auth-helpers";
import { isValidTransition } from "@/lib/job-flow";
import { withJobLock } from "@/lib/job-lock";
import { autoAllocateJob } from "./auto-allocate";
import { completeJobForClient } from "./complete-job";

export async function setJobStage(jobId: string, toStage: JobStage) {
  await assertRoleForAction(WRITE_ROLES);
  const user = await requireUser();
  await withJobLock(jobId, () => doSetJobStage(jobId, toStage, user.id));
}

async function doSetJobStage(
  jobId: string,
  toStage: JobStage,
  userId: string,
): Promise<void> {
  const job = await prisma.jobberJob.findUnique({
    where: { id: jobId },
    select: { id: true, currentStage: true },
  });
  if (!job) throw new Error("Job not found");

  if (!isValidTransition(job.currentStage, toStage)) {
    throw new Error(
      `Can't move from ${job.currentStage} to ${toStage}. You can step back to any previous stage or advance one stage at a time.`,
    );
  }

  // Run the stage's inventory side effect BEFORE recording the transition, so
  // a failure leaves the job at its current stage (retryable) rather than
  // advanced-but-half-applied. Both side effects are idempotent/resumable, so
  // a retry finishes the job without double-applying.
  if (toStage === "ALLOCATED") {
    // Idempotent — only lines not yet allocated get processed.
    await autoAllocateJob(jobId);
  }
  if (toStage === "COMPLETE") {
    // Idempotent — guarded by Client status + customerKitsSyncedAt.
    await completeJobForClient(jobId);
  }

  await prisma.$transaction([
    prisma.jobberJob.update({
      where: { id: jobId },
      data: { currentStage: toStage },
    }),
    prisma.jobStageEvent.create({
      data: {
        jobId,
        fromStage: job.currentStage,
        toStage,
        byUserId: userId,
      },
    }),
  ]);

  revalidatePath(`/job-flow/jobs/${jobId}`);
}
