"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, WRITE_ROLES } from "@/lib/auth-helpers";
import {
  syncClientsAndProperties,
  syncProductsAndServices,
  syncJobs,
  syncVisits,
  syncNotes,
  type SyncResult,
  type InventorySyncResult,
  type JobsSyncResult,
  type VisitsSyncResult,
  type NotesSyncResult,
} from "@/lib/jobber/sync";
import { JobberNotConnectedError } from "@/lib/jobber/client";
import type { FormState } from "./state";

export async function disconnectJobber() {
  await assertRoleForAction("ADMIN");
  await prisma.jobberConnection.deleteMany({});
  revalidatePath("/job-flow/jobber");
}

export type SyncFormState = FormState & {
  result?: SyncResult;
};

export async function syncJobberCustomers(
  _prev: SyncFormState,
): Promise<SyncFormState> {
  await assertRoleForAction(WRITE_ROLES);

  try {
    const result = await syncClientsAndProperties();
    revalidatePath("/job-flow/customers");
    revalidatePath("/job-flow/jobber");
    return { errors: {}, message: null, result };
  } catch (err) {
    if (err instanceof JobberNotConnectedError) {
      return {
        errors: {},
        message: "Jobber is not connected. Connect first, then try syncing.",
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Jobber sync failed:", err);
    return { errors: {}, message: `Sync failed: ${msg}` };
  }
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

export type JobFlowSyncResult = {
  jobs: JobsSyncResult | null;
  visits: VisitsSyncResult | null;
  notes: NotesSyncResult | null;
};

export type JobsSyncFormState = FormState & { result?: JobFlowSyncResult };

function notConnectedState<T extends FormState>(): T {
  return {
    errors: {},
    message:
      "Jobber is not connected. Connect on Job Flow → Jobber first, then try syncing.",
  } as T;
}

export async function syncJobberJobs(
  _prev: JobsSyncFormState,
): Promise<JobsSyncFormState> {
  await assertRoleForAction(WRITE_ROLES);

  const phaseErrors: string[] = [];
  let jobs: JobsSyncResult | null = null;
  let visits: VisitsSyncResult | null = null;
  let notes: NotesSyncResult | null = null;

  try {
    jobs = await syncJobs();
  } catch (err) {
    if (err instanceof JobberNotConnectedError) return notConnectedState();
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Jobber jobs sync failed:", err);
    phaseErrors.push(`Jobs: ${msg}`);
  }

  if (jobs) {
    try {
      visits = await syncVisits();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Jobber visits sync failed:", err);
      phaseErrors.push(`Visits: ${msg}`);
    }
  }

  if (jobs && visits) {
    try {
      notes = await syncNotes();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Jobber notes sync failed:", err);
      phaseErrors.push(`Notes: ${msg}`);
    }
  }

  revalidatePath("/job-flow/jobs");
  revalidatePath("/job-flow/calendar");
  revalidatePath("/job-flow/customers");
  revalidatePath("/job-flow/jobber");

  return {
    errors: {},
    message: phaseErrors.length ? `Sync failed: ${phaseErrors.join(" · ")}` : null,
    result: { jobs, visits, notes },
  };
}
