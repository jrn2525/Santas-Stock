"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, ADMIN_ROLES, WRITE_ROLES } from "@/lib/auth-helpers";
import {
  syncProductsAndServices,
  type InventorySyncResult,
} from "@/lib/jobber/sync";
import { runJobFlowSync, type JobFlowSyncResult } from "@/lib/jobber/run-sync";
import { runWithSyncLock } from "@/lib/jobber/sync-lock";
import { JobberNotConnectedError } from "@/lib/jobber/client";
import { listStaleJobs, type StaleJobDTO } from "@/lib/stale-jobs";
import type { FormState } from "./state";

export async function disconnectJobber() {
  await assertRoleForAction("ADMIN");
  await prisma.jobberConnection.deleteMany({});
  revalidatePath("/job-flow/jobber");
}

// Wipe the sync-run history shown on the View Logs page. ADMIN-only.
export async function clearSyncLogs() {
  await assertRoleForAction(ADMIN_ROLES);
  await prisma.syncRun.deleteMany({});
  revalidatePath("/job-flow/jobber/logs");
}

export type InventorySyncFormState = FormState & {
  result?: InventorySyncResult;
};

export async function syncJobberInventory(
  _prev: InventorySyncFormState,
): Promise<InventorySyncFormState> {
  await assertRoleForAction(WRITE_ROLES);

  try {
    // Share the lock with the job/webhook syncs so two heavy syncs never run at
    // once and race the claim-by-name matching into duplicate Items/Kits.
    const outcome = await runWithSyncLock(() => syncProductsAndServices());
    if (!outcome.ran) {
      return {
        errors: {},
        message: "A sync is already running. Try again in a moment.",
      };
    }
    revalidatePath("/inventory/items");
    revalidatePath("/inventory/kits");
    revalidatePath("/inventory/jobber");
    return { errors: {}, message: null, result: outcome.value };
  } catch (err) {
    if (err instanceof JobberNotConnectedError) {
      return {
        errors: {},
        message:
          "Jobber is not connected. Connect on Job Flow → Jobber first, then try syncing.",
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Jobber inventory sync failed:", err);
    return { errors: {}, message: `Sync failed: ${msg}` };
  }
}

export type JobsSyncFormState = FormState & {
  result?: JobFlowSyncResult;
  // Jobs that exist in Santa's Stock but were deleted in Jobber, for the
  // review pop-up. Present only after a sync that actually ran.
  staleJobs?: StaleJobDTO[];
};

export async function syncJobberJobs(
  _prev: JobsSyncFormState,
): Promise<JobsSyncFormState> {
  const user = await assertRoleForAction(WRITE_ROLES);

  const run = await runJobFlowSync({
    trigger: "MANUAL",
    triggeredByName: user.name ?? user.email ?? null,
  });

  if (run.notConnected) {
    return {
      errors: {},
      message:
        "Jobber is not connected. Connect on Job Flow → Jobber first, then try syncing.",
    };
  }
  if (!run.ran) {
    return {
      errors: {},
      message: "A sync is already running — give it a moment and try again.",
    };
  }

  revalidatePath("/job-flow/jobs");
  revalidatePath("/job-flow/calendar");
  revalidatePath("/job-flow/pick-list");
  revalidatePath("/job-flow/jobber");

  // Surface any jobs that Jobber no longer has so the page can pop the review.
  const staleJobs = await listStaleJobs();

  return {
    errors: {},
    message: run.phaseErrors.length
      ? `Sync failed: ${run.phaseErrors.join(" · ")}`
      : null,
    result: run.result,
    staleJobs,
  };
}
