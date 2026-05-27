"use server";

import { revalidatePath } from "next/cache";
import type { JobStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, WRITE_ROLES, requireUser } from "@/lib/auth-helpers";
import { isValidTransition } from "@/lib/job-flow";
import { autoAllocateJob } from "./auto-allocate";
import { completeJobForClient } from "./complete-job";

// Per-job in-process serialization. A double-click or two open tabs can fire
// setJobStage twice at once; without this, both could pass isValidTransition
// against the same stale stage and double-apply the stage's inventory side
// effect (e.g. allocate the same lines twice). Chaining tasks per jobId means
// the second runs only after the first finishes — by which point the stage has
// moved and the duplicate fails the validity check harmlessly.
// (Single Railway instance assumed — same model as the Jobber sync locks.)
const jobStageLocks = new Map<string, Promise<unknown>>();

export async function setJobStage(jobId: string, toStage: JobStage) {
  await assertRoleForAction(WRITE_ROLES);
  const user = await requireUser();

  const prior = jobStageLocks.get(jobId) ?? Promise.resolve();
  // The get + compute + set below run synchronously (no await between them),
  // so concurrent callers reliably chain instead of racing.
  const task = prior
    .catch(() => undefined)
    .then(() => doSetJobStage(jobId, toStage, user.id));
  jobStageLocks.set(jobId, task);
  try {
    await task;
  } finally {
    if (jobStageLocks.get(jobId) === task) {
      jobStageLocks.delete(jobId);
    }
  }
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
