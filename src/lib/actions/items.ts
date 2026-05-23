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

const ItemSchema = z.object({
  // Required fields
  name: z.string().min(1, "Name is required.").max(160),
  description: z.string().min(1, "Description is required.").max(500),
  status: z.nativeEnum(ItemStatus),
  quantity: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 0 : Number(v)),
    z.number().int().min(0, "Quantity must be 0 or more."),
  ),
  minQuantity: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 0 : Number(v)),
    z.number().int().min(0, "Min quantity must be 0 or more."),
  ),
  active: z.preprocess(
    (v) => v === "on" || v === "true" || v === true,
    z.boolean(),
  ),
  websites: z.preprocess(
    (v) => parseWebsitesJson(v),
    z.array(z.string().min(1).max(500)).max(50),
  ),

  // Optional fields
  sku: optionalString,
  manufacturer: optionalString,
  model: optionalString,
  productType: optionalProductType,
  homeLocation: optionalString,
  currentLocation: optionalString,
  unitCost: optionalDecimal,
});

function parseWebsitesJson(value: unknown): string[] {
  if (typeof value !== "string" || value.length === 0) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of parsed) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
    return out;
  } catch {
    return [];
  }
}

function readForm(formData: FormData) {
  return ItemSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    status: formData.get("status"),
    quantity: formData.get("quantity"),
    minQuantity: formData.get("minQuantity"),
    active: formData.get("active"),
    websites: formData.get("websites"),
    sku: formData.get("sku"),
    manufacturer: formData.get("manufacturer"),
    model: formData.get("model"),
    productType: formData.get("productType"),
    homeLocation: formData.get("homeLocation"),
    currentLocation: formData.get("currentLocation"),
    unitCost: formData.get("unitCost"),
  });
}

function buildData(parsed: z.infer<typeof ItemSchema>) {
  return {
    name: parsed.name,
    description: parsed.description,
    status: parsed.status,
    quantity: parsed.quantity,
    minQuantity: parsed.minQuantity,
    active: parsed.active,
    websites: parsed.websites,
    sku: parsed.sku,
    manufacturer: parsed.manufacturer,
    model: parsed.model,
    productType: parsed.productType,
    homeLocation: parsed.homeLocation,
    currentLocation: parsed.currentLocation,
    unitCost: parsed.unitCost === null ? null : new Prisma.Decimal(parsed.unitCost),
  };
}

function uniqueErrorFields(target: unknown): string[] {
  if (!target) return [];
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === "string") return [target];
  return [];
}

function uniqueViolationState(err: Prisma.PrismaClientKnownRequestError): FormState {
  const fields = uniqueErrorFields(err.meta?.target);
  const errors: Record<string, string[]> = {};
  for (const field of fields) {
    errors[field] = [`That ${field} is already in use.`];
  }
  return {
    errors: Object.keys(errors).length ? errors : { sku: ["Unique constraint violated."] },
    message: null,
  };
}

export async function createItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await assertRoleForAction(WRITE_ROLES);

  const parsed = readForm(formData);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: null };
  }

  try {
    await prisma.item.create({ data: buildData(parsed.data) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return uniqueViolationState(err);
    }
    throw err;
  }

  revalidatePath("/inventory/items");
  redirect("/inventory/items");
}

export async function updateItem(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await assertRoleForAction(WRITE_ROLES);

  const parsed = readForm(formData);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: null };
  }

  const data = buildData(parsed.data);

  // Name / Description / Unit Cost are managed in Jobber. Always preserve
  // the DB values on update; the edit form locks these fields but the
  // server enforces it independently in case the form is bypassed.
  const existing = await prisma.item.findUnique({
    where: { id },
    select: { name: true, description: true, unitCost: true },
  });
  if (existing) {
    data.name = existing.name;
    data.description = existing.description;
    data.unitCost = existing.unitCost;
  }

  try {
    await prisma.item.update({ where: { id }, data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return uniqueViolationState(err);
    }
    throw err;
  }

  revalidatePath("/inventory/items");
  redirect("/inventory/items");
}

export async function deleteItem(id: string) {
  await assertRoleForAction(WRITE_ROLES);

  try {
    await prisma.item.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      throw new Error(
        "Cannot delete an item that is part of a kit, allocation, or maintenance ticket.",
      );
    }
    throw err;
  }

  revalidatePath("/inventory/items");
}
