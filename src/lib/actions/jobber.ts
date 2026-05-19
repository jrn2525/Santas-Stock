"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, WRITE_ROLES } from "@/lib/auth-helpers";
import {
  syncClientsAndProperties,
  syncProductsAndServices,
  type SyncResult,
  type InventorySyncResult,
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
