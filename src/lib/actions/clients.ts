"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  assertRoleForAction,
  WRITE_ROLES,
} from "@/lib/auth-helpers";

/**
 * Flip a Client's `active` flag. Used from the Customer detail page
 * when a customer is gone (cancelled service permanently, won't be
 * coming back) or when re-activating someone you accidentally
 * deactivated.
 *
 * Distinct from job-level DEACTIVATED stage: a customer can have one
 * job deactivated for a property but still be active for their other
 * properties. This flag is the manual, customer-wide signal.
 *
 * On deactivation:
 *   - active -> false
 *   - deactivatedAt -> now()
 *   - deactivationReason captured if provided
 *
 * On reactivation:
 *   - active -> true
 *   - deactivatedAt -> null
 *   - deactivationReason -> null
 */
export async function setClientActive(
  clientId: string,
  active: boolean,
  reason?: string | null,
): Promise<void> {
  await assertRoleForAction(WRITE_ROLES);

  if (active) {
    await prisma.client.update({
      where: { id: clientId },
      data: {
        active: true,
        deactivatedAt: null,
        deactivationReason: null,
      },
    });
  } else {
    const trimmed = reason?.trim();
    await prisma.client.update({
      where: { id: clientId },
      data: {
        active: false,
        deactivatedAt: new Date(),
        deactivationReason: trimmed && trimmed.length > 0 ? trimmed : null,
      },
    });
  }

  revalidatePath(`/job-flow/clients/${clientId}`);
  revalidatePath("/job-flow/jobs");
}
