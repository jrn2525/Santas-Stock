"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, WRITE_ROLES } from "@/lib/auth-helpers";
import type { FormState } from "./state";

const KitItemSchema = z.object({
  itemId: z.string().min(1, "Item is required."),
  quantity: z.number().int().positive("Quantity must be at least 1."),
});

const KitSchema = z.object({
  name: z.string().min(1, "Name is required.").max(160),
  kitItems: z.array(KitItemSchema).min(1, "Add at least one item."),
});

function parseKitItemsJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || value.length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => ({
      itemId: typeof row?.itemId === "string" ? row.itemId : "",
      quantity:
        typeof row?.quantity === "number"
          ? row.quantity
          : Number(row?.quantity) || 0,
    }));
  } catch {
    return [];
  }
}

function readForm(formData: FormData) {
  return KitSchema.safeParse({
    name: formData.get("name"),
    kitItems: parseKitItemsJson(formData.get("kitItems")),
  });
}

function consolidate(rows: { itemId: string; quantity: number }[]) {
  // If the same item appears multiple times, sum the quantities.
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.itemId, (map.get(r.itemId) ?? 0) + r.quantity);
  }
  return Array.from(map, ([itemId, quantity]) => ({ itemId, quantity }));
}

export async function createKit(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await assertRoleForAction(WRITE_ROLES);

  const parsed = readForm(formData);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const errors: Record<string, string[]> = { ...flat.fieldErrors };
    if (flat.formErrors.length) {
      errors._form = flat.formErrors;
    }
    return { errors, message: null };
  }

  const items = consolidate(parsed.data.kitItems);

  try {
    await prisma.kit.create({
      data: {
        name: parsed.data.name,
        items: { create: items },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return {
        errors: { kitItems: ["One or more selected items no longer exist."] },
        message: null,
      };
    }
    throw err;
  }

  revalidatePath("/inventory/kits");
  redirect("/inventory/kits");
}

export async function updateKit(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await assertRoleForAction(WRITE_ROLES);

  const parsed = readForm(formData);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const errors: Record<string, string[]> = { ...flat.fieldErrors };
    if (flat.formErrors.length) {
      errors._form = flat.formErrors;
    }
    return { errors, message: null };
  }

  const items = consolidate(parsed.data.kitItems);

  try {
    await prisma.$transaction([
      prisma.kitItem.deleteMany({ where: { kitId: id } }),
      prisma.kit.update({
        where: { id },
        data: {
          name: parsed.data.name,
          items: { create: items },
        },
      }),
    ]);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return {
        errors: { kitItems: ["One or more selected items no longer exist."] },
        message: null,
      };
    }
    throw err;
  }

  revalidatePath("/inventory/kits");
  redirect("/inventory/kits");
}

export async function deleteKit(id: string) {
  await assertRoleForAction(WRITE_ROLES);

  await prisma.kit.delete({ where: { id } });
  revalidatePath("/inventory/kits");
}
