"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ItemStatus, Prisma, ProductType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, WRITE_ROLES } from "@/lib/auth-helpers";
import type { FormState } from "./state";

const optionalString = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : String(v).trim() || null),
  z.string().nullable(),
);

const optionalDecimal = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z
    .union([z.string(), z.number()])
    .nullable()
    .refine(
      (v) => v === null || (!isNaN(Number(v)) && Number(v) >= 0),
      "Must be a non-negative number.",
    ),
);

const optionalProductType = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.nativeEnum(ProductType).nullable(),
);

const KitItemSchema = z.object({
  itemId: z.string().min(1, "Item is required."),
  quantity: z.number().int().positive("Quantity must be at least 1."),
});

const KitSchema = z.object({
  // Required
  name: z.string().min(1, "Name is required.").max(160),
  description: z.preprocess(
    (v) => (v === null || v === undefined ? "" : String(v)),
    z.string().max(500),
  ),
  status: z.nativeEnum(ItemStatus),
  quantity: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 0 : Number(v)),
    z.number().int().min(0, "Quantity must be 0 or more."),
  ),
  active: z.preprocess(
    (v) => v === "on" || v === "true" || v === true,
    z.boolean(),
  ),
  kitItems: z.array(KitItemSchema).min(1, "Add at least one item."),

  // Optional
  sku: optionalString,
  manufacturer: optionalString,
  model: optionalString,
  productType: optionalProductType,
  homeLocation: optionalString,
  currentLocation: optionalString,
  unitCost: optionalDecimal,
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
    description: formData.get("description"),
    status: formData.get("status"),
    quantity: formData.get("quantity"),
    active: formData.get("active"),
    sku: formData.get("sku"),
    manufacturer: formData.get("manufacturer"),
    model: formData.get("model"),
    productType: formData.get("productType"),
    homeLocation: formData.get("homeLocation"),
    currentLocation: formData.get("currentLocation"),
    unitCost: formData.get("unitCost"),
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

function buildScalarData(parsed: z.infer<typeof KitSchema>) {
  return {
    name: parsed.name,
    description: parsed.description,
    status: parsed.status,
    quantity: parsed.quantity,
    active: parsed.active,
    sku: parsed.sku,
    manufacturer: parsed.manufacturer,
    model: parsed.model,
    productType: parsed.productType,
    homeLocation: parsed.homeLocation,
    currentLocation: parsed.currentLocation,
    unitCost:
      parsed.unitCost === null ? null : new Prisma.Decimal(parsed.unitCost),
  };
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
        ...buildScalarData(parsed.data),
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

  // Defense in depth: if this Kit is linked to a Jobber service, Jobber
  // owns name/description/unitCost. Preserve whatever's in the DB.
  const scalarData = buildScalarData(parsed.data);
  const existing = await prisma.kit.findUnique({
    where: { id },
    select: {
      jobberProductId: true,
      name: true,
      description: true,
      unitCost: true,
    },
  });
  if (existing?.jobberProductId) {
    scalarData.name = existing.name;
    scalarData.description = existing.description;
    scalarData.unitCost = existing.unitCost;
  }

  try {
    await prisma.$transaction([
      prisma.kitItem.deleteMany({ where: { kitId: id } }),
      prisma.kit.update({
        where: { id },
        data: {
          ...scalarData,
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
