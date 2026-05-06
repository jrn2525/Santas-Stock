"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  ConditionGrade,
  ItemStatus,
  LifecycleType,
  Prisma,
} from "@prisma/client";
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
  description: optionalString,
  manufacturer: optionalString,
  model: optionalString,
  serial: optionalString,
  barcode: optionalString,
  categoryId: optionalString,
  status: z.nativeEnum(ItemStatus),
  conditionGrade: z.nativeEnum(ConditionGrade),
  lifecycleType: z.nativeEnum(LifecycleType),
  currentLocationId: optionalString,
  homeLocationId: optionalString,
  purchaseCost: optionalDecimal,
  replacementCost: optionalDecimal,
});

function readForm(formData: FormData) {
  return ItemSchema.safeParse({
    sku: formData.get("sku"),
    name: formData.get("name"),
    description: formData.get("description"),
    manufacturer: formData.get("manufacturer"),
    model: formData.get("model"),
    serial: formData.get("serial"),
    barcode: formData.get("barcode"),
    categoryId: formData.get("categoryId"),
    status: formData.get("status"),
    conditionGrade: formData.get("conditionGrade"),
    lifecycleType: formData.get("lifecycleType"),
    currentLocationId: formData.get("currentLocationId"),
    homeLocationId: formData.get("homeLocationId"),
    purchaseCost: formData.get("purchaseCost"),
    replacementCost: formData.get("replacementCost"),
  });
}

function buildData(parsed: z.infer<typeof ItemSchema>) {
  return {
    sku: parsed.sku,
    name: parsed.name,
    description: parsed.description,
    manufacturer: parsed.manufacturer,
    model: parsed.model,
    serial: parsed.serial,
    barcode: parsed.barcode,
    categoryId: parsed.categoryId,
    status: parsed.status,
    conditionGrade: parsed.conditionGrade,
    lifecycleType: parsed.lifecycleType,
    currentLocationId: parsed.currentLocationId,
    homeLocationId: parsed.homeLocationId,
    purchaseCost: parsed.purchaseCost === null ? null : new Prisma.Decimal(parsed.purchaseCost),
    replacementCost:
      parsed.replacementCost === null ? null : new Prisma.Decimal(parsed.replacementCost),
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
