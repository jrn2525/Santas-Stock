"use server";

import { revalidatePath } from "next/cache";
import type { JobStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, WRITE_ROLES, requireUser } from "@/lib/auth-helpers";
import { isValidTransition } from "@/lib/job-flow";
import { autoAllocateJob } from "./auto-allocate";

export async function setJobStage(jobId: string, toStage: JobStage) {
  await assertRoleForAction(WRITE_ROLES);
  const user = await requireUser();

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
        byUserId: user.id,
      },
    }),
  ]);

  // Entering ALLOCATED runs auto-allocation. Idempotent — only lines that
  // haven't been allocated yet get processed, so re-entering this stage
  // doesn't double-deduct inventory.
  if (toStage === "ALLOCATED") {
    await autoAllocateJob(jobId);
  }

  revalidatePath(`/job-flow/jobs/${jobId}`);
}
