"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { LocationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, WRITE_ROLES } from "@/lib/auth-helpers";
import type { FormState } from "./state";

const optionalString = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().nullable(),
);

const LocationSchema = z.object({
  name: z.string().min(1, "Name is required.").max(120),
  type: z.nativeEnum(LocationType),
  parentId: optionalString,
  barcode: optionalString,
});

function readForm(formData: FormData) {
  return LocationSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    parentId: formData.get("parentId"),
    barcode: formData.get("barcode"),
  });
}

export async function createLocation(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await assertRoleForAction(WRITE_ROLES);

  const parsed = readForm(formData);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: null };
  }

  try {
    await prisma.location.create({ data: parsed.data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        errors: { barcode: ["That barcode is already in use."] },
        message: null,
      };
    }
    throw err;
  }

  revalidatePath("/locations");
  redirect("/locations");
}

export async function updateLocation(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await assertRoleForAction(WRITE_ROLES);

  const parsed = readForm(formData);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: null };
  }

  if (parsed.data.parentId === id) {
    return { errors: { parentId: ["A location cannot be its own parent."] }, message: null };
  }

  try {
    await prisma.location.update({ where: { id }, data: parsed.data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        errors: { barcode: ["That barcode is already in use."] },
        message: null,
      };
    }
    throw err;
  }

  revalidatePath("/locations");
  redirect("/locations");
}

export async function deleteLocation(id: string) {
  await assertRoleForAction(WRITE_ROLES);

  try {
    await prisma.location.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      throw new Error(
        "Cannot delete a location that has items assigned or sub-locations.",
      );
    }
    throw err;
  }

  revalidatePath("/locations");
}
