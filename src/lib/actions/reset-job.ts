"use server";

import { assertRoleForAction, ADMIN_ROLES } from "@/lib/auth-helpers";
import { withJobLock } from "@/lib/job-lock";
import { resetJobCore } from "@/lib/reset-job-core";

/**
 * Hard reset of a job back to its original imported state. Restricted to
 * ADMIN. Atomic — either every undo runs or none do. The actual restore logic
 * lives in resetJobCore (shared with the manager-allowed stale-job delete);
 * this wrapper only enforces the ADMIN gate and the explicit "RESET"
 * confirmation token so it can't be fired accidentally from a call site that
 * skips the UI confirmation flow.
 *
 * See resetJobCore for the full list of what is and isn't unwound.
 */
export async function resetJob(
  jobId: string,
  confirmation: string,
): Promise<{ itemRestores: number; kitsRestoredToTote: number }> {
  if (confirmation !== "RESET") {
    throw new Error(
      'Confirmation required. Pass "RESET" exactly to reset this job.',
    );
  }
  await assertRoleForAction(ADMIN_ROLES);
  // Serialize on the job like every other inventory-mutating action, so a
  // reset can't interleave with a concurrent allocate/change-order/inspection
  // on the same job and double-count stock.
  return withJobLock(jobId, () => resetJobCore(jobId));
}
