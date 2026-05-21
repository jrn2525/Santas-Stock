"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  assertRoleForAction,
  WRITE_ROLES,
} from "@/lib/auth-helpers";

/**
 * Called when a job's stage advances to COMPLETE (the terminal "Ready"
 * button). Flips the job's client from NEW -> EXISTING the first time
 * any of their jobs reaches COMPLETE, and records firstCompletedAt.
 *
 * Idempotent. Calling on a client that's already EXISTING is a no-op.
 * Reverting a job out of COMPLETE later does NOT roll the customer
 * back to NEW — once existing, they stay existing.
 *
 * This is the hook the Year-2 pick-list branching reads later: when
 * planning a job for an EXISTING customer, the pre-built customer-
 * specific kits can be reused without re-allocating raw inventory.
 */
export async function completeJobForClient(jobId: string): Promise<{
  converted: boolean;
}> {
  await assertRoleForAction(WRITE_ROLES);

  const job = await prisma.jobberJob.findUnique({
    where: { id: jobId },
    select: { id: true, clientId: true },
  });
  if (!job) throw new Error("Job not found");

  const client = await prisma.client.findUnique({
    where: { id: job.clientId },
    select: { id: true, customerStatus: true, firstCompletedAt: true },
  });
  if (!client) return { converted: false };

  if (client.customerStatus === "EXISTING") {
    return { converted: false };
  }

  await prisma.client.update({
    where: { id: client.id },
    data: {
      customerStatus: "EXISTING",
      firstCompletedAt: client.firstCompletedAt ?? new Date(),
    },
  });

  revalidatePath(`/job-flow/jobs/${jobId}`);
  return { converted: true };
}
