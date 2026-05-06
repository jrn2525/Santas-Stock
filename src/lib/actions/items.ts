"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ItemStatus, LifecycleType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, WRITE_ROLES } from "@/lib/auth-helpers";
import type { FormState } from "./state";

const optionalString = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
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

const ItemSchema = z.object({
  sku: z.string().min(1, "SKU is required.").max(64),
  name: z.string().min(1, "Name is required.").max(160),
  manufacturer: optionalString,
  model: optionalString,
  serial: optionalString,
  barcode: optionalString,
  descriptionId: optionalString,
  status: z.nativeEnum(ItemStatus),
  lifecycleType: z.nativeEnum(LifecycleType),
  quantity: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 0 : Number(v)),
    z.number().int().min(0, "Quantity must be 0 or more."),
  ),
  currentLocationId: optionalString,
  homeLocationId: optionalString,
  unitCost: optionalDecimal,
});

function readForm(formData: FormData) {
  return ItemSchema.safeParse({
    sku: formData.get("sku"),
    name: formData.get("name"),
    manufacturer: formData.get("manufacturer"),
    model: formData.get("model"),
    serial: formData.get("serial"),
    barcode: formData.get("barcode"),
    descriptionId: formData.get("descriptionId"),
    status: formData.get("status"),
    lifecycleType: formData.get("lifecycleType"),
    quantity: formData.get("quantity"),
    currentLocationId: formData.get("currentLocationId"),
    homeLocationId: formData.get("homeLocationId"),
    unitCost: formData.get("unitCost"),
  });
}

function buildData(parsed: z.infer<typeof ItemSchema>) {
  return {
    sku: parsed.sku,
    name: parsed.name,
    manufacturer: parsed.manufacturer,
    model: parsed.model,
    serial: parsed.serial,
    barcode: parsed.barcode,
    descriptionId: parsed.descriptionId,
    status: parsed.status,
    lifecycleType: parsed.lifecycleType,
    quantity: parsed.quantity,
    currentLocationId: parsed.currentLocationId,
    homeLocationId: parsed.homeLocationId,
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

  revalidatePath("/items");
  redirect("/items");
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

  try {
    await prisma.item.update({ where: { id }, data: buildData(parsed.data) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return uniqueViolationState(err);
    }
    throw err;
  }

  revalidatePath("/items");
  redirect("/items");
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

  revalidatePath("/items");
}
