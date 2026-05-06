"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ConditionGrade, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, WRITE_ROLES } from "@/lib/auth-helpers";
import type { FormState } from "./state";

const optionalInt = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().positive().nullable(),
);

const optionalConditionGrade = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.nativeEnum(ConditionGrade).nullable(),
);

const optionalString = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().nullable(),
);

const CategorySchema = z.object({
  name: z.string().min(1, "Name is required.").max(120),
  parentId: optionalString,
  defaultRetirementMaxSeasons: optionalInt,
  defaultRetirementMaxRepairs: optionalInt,
  defaultRetirementConditionFloor: optionalConditionGrade,
});

function readForm(formData: FormData) {
  return CategorySchema.safeParse({
    name: formData.get("name"),
    parentId: formData.get("parentId"),
    defaultRetirementMaxSeasons: formData.get("defaultRetirementMaxSeasons"),
    defaultRetirementMaxRepairs: formData.get("defaultRetirementMaxRepairs"),
    defaultRetirementConditionFloor: formData.get("defaultRetirementConditionFloor"),
  });
}

export async function createCategory(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await assertRoleForAction(WRITE_ROLES);

  const parsed = readForm(formData);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: null };
  }

  try {
    await prisma.category.create({ data: parsed.data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        errors: { name: ["A category with this name already exists at this level."] },
        message: null,
      };
    }
    throw err;
  }

  revalidatePath("/categories");
  redirect("/categories");
}

export async function updateCategory(
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
    return { errors: { parentId: ["A category cannot be its own parent."] }, message: null };
  }

  try {
    await prisma.category.update({ where: { id }, data: parsed.data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        errors: { name: ["A category with this name already exists at this level."] },
        message: null,
      };
    }
    throw err;
  }

  revalidatePath("/categories");
  redirect("/categories");
}

export async function deleteCategory(id: string) {
  await assertRoleForAction(WRITE_ROLES);

  try {
    await prisma.category.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      throw new Error("Cannot delete a category that has items or sub-categories.");
    }
    throw err;
  }

  revalidatePath("/categories");
}
