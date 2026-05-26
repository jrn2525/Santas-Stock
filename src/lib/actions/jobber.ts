"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, WRITE_ROLES } from "@/lib/auth-helpers";
import {
  syncProductsAndServices,
  type InventorySyncResult,
} from "@/lib/jobber/sync";
import { runJobFlowSync, type JobFlowSyncResult } from "@/lib/jobber/run-sync";
import { JobberNotConnectedError } from "@/lib/jobber/client";
import type { FormState } from "./state";

export async function disconnectJobber() {
  await assertRoleForAction("ADMIN");
  await prisma.jobberConnection.deleteMany({});
  revalidatePath("/job-flow/jobber");
}

export type InventorySyncFormState = FormState & {
  result?: InventorySyncResult;
};

export async function syncJobberInventory(
  _prev: InventorySyncFormState,
): Promise<InventorySyncFormState> {
  await assertRoleForAction(WRITE_ROLES);

  try {
    const result = await syncProductsAndServices();
    revalidatePath("/inventory/items");
    revalidatePath("/inventory/kits");
    revalidatePath("/inventory/jobber");
    return { errors: {}, message: null, result };
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

export type JobsSyncFormState = FormState & { result?: JobFlowSyncResult };

export async function syncJobberJobs(
  _prev: JobsSyncFormState,
): Promise<JobsSyncFormState> {
  await assertRoleForAction(WRITE_ROLES);

  const run = await runJobFlowSync();

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

  return {
    errors: {},
    message: run.phaseErrors.length
      ? `Sync failed: ${run.phaseErrors.join(" · ")}`
      : null,
    result: run.result,
  };
}
