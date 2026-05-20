"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, ADMIN_ROLES } from "@/lib/auth-helpers";

export type CleanupResult = { deleted: number };

export async function bulkDeleteItems(ids: string[]): Promise<CleanupResult> {
  await assertRoleForAction(ADMIN_ROLES);
  if (ids.length === 0) return { deleted: 0 };

  const deleted = await prisma.$transaction(async (tx) => {
    await tx.maintenanceTicket.deleteMany({ where: { itemId: { in: ids } } });
    await tx.replacementQueue.deleteMany({ where: { itemId: { in: ids } } });
    await tx.jobLineItem.updateMany({
      where: { itemId: { in: ids } },
      data: { itemId: null },
    });
    await tx.allocation.updateMany({
      where: { itemId: { in: ids } },
      data: { itemId: null },
    });
    await tx.kitItem.deleteMany({ where: { itemId: { in: ids } } });
    const res = await tx.item.deleteMany({ where: { id: { in: ids } } });
    return res.count;
  });

  revalidatePath("/admin/cleanup");
  revalidatePath("/inventory/items");
  revalidatePath("/inventory/kits");
  return { deleted };
}

export async function deleteAllItems(): Promise<CleanupResult> {
  await assertRoleForAction(ADMIN_ROLES);

  const deleted = await prisma.$transaction(async (tx) => {
    await tx.maintenanceTicket.deleteMany({});
    await tx.replacementQueue.deleteMany({});
    await tx.jobLineItem.updateMany({
      where: { itemId: { not: null } },
      data: { itemId: null },
    });
    await tx.allocation.updateMany({
      where: { itemId: { not: null } },
      data: { itemId: null },
    });
    await tx.kitItem.deleteMany({});
    const res = await tx.item.deleteMany({});
    return res.count;
  });

  revalidatePath("/admin/cleanup");
  revalidatePath("/inventory/items");
  revalidatePath("/inventory/kits");
  return { deleted };
}

export async function bulkDeleteKits(ids: string[]): Promise<CleanupResult> {
  await assertRoleForAction(ADMIN_ROLES);
  if (ids.length === 0) return { deleted: 0 };

  const deleted = await prisma.$transaction(async (tx) => {
    await tx.jobLineItem.updateMany({
      where: { kitId: { in: ids } },
      data: { kitId: null },
    });
    await tx.allocation.updateMany({
      where: { kitId: { in: ids } },
      data: { kitId: null },
    });
    await tx.kitItem.deleteMany({ where: { kitId: { in: ids } } });
    const res = await tx.kit.deleteMany({ where: { id: { in: ids } } });
    return res.count;
  });

  revalidatePath("/admin/cleanup");
  revalidatePath("/inventory/items");
  revalidatePath("/inventory/kits");
  return { deleted };
}

export async function deleteAllKits(): Promise<CleanupResult> {
  await assertRoleForAction(ADMIN_ROLES);

  const deleted = await prisma.$transaction(async (tx) => {
    await tx.jobLineItem.updateMany({
      where: { kitId: { not: null } },
      data: { kitId: null },
    });
    await tx.allocation.updateMany({
      where: { kitId: { not: null } },
      data: { kitId: null },
    });
    await tx.kitItem.deleteMany({});
    const res = await tx.kit.deleteMany({});
    return res.count;
  });

  revalidatePath("/admin/cleanup");
  revalidatePath("/inventory/items");
  revalidatePath("/inventory/kits");
  return { deleted };
}
