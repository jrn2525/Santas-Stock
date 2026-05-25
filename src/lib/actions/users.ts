"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_ROLES,
  assertRoleForAction,
} from "@/lib/auth-helpers";
import { auth, signOut } from "@/auth";
import type { FormState } from "./state";

// Easy-to-read alphabet: no 0/O, no 1/l/I. Avoids confusion when an admin
// reads a temp password to a user out loud.
const TEMP_PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generateTempPassword(length = 12): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_ALPHABET[bytes[i] % TEMP_PASSWORD_ALPHABET.length];
  }
  return out;
}

export type CreateUserState = FormState & {
  tempPassword?: string;
  createdUserId?: string;
};

const CreateUserSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  name: z.string().min(1, "Name is required.").max(120),
  role: z.nativeEnum(Role),
});

const UpdateUserSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  name: z.string().min(1, "Name is required.").max(120),
  role: z.nativeEnum(Role),
  active: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});

function uniqueEmailErrorState(): FormState {
  return {
    errors: { email: ["That email is already in use."] },
    message: null,
  };
}

export async function createUser(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  await assertRoleForAction(ADMIN_ROLES);

  const parsed = CreateUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: null };
  }

  // GUEST is a shared demo account: the admin types its password directly
  // on the form and it's never forced to change (handed out and reused
  // as-is). Every other role gets an auto-generated temporary password and
  // bounces to /account/change-password on first login.
  const isGuest = parsed.data.role === "GUEST";
  let password: string;
  if (isGuest) {
    const raw = formData.get("password");
    const guestPassword = typeof raw === "string" ? raw : "";
    if (guestPassword.length < 8) {
      return {
        errors: { password: ["Guest password must be at least 8 characters."] },
        message: null,
      };
    }
    password = guestPassword;
  } else {
    password = generateTempPassword();
  }
  const passwordHash = await bcrypt.hash(password, 10);

  let created;
  try {
    created = await prisma.user.create({
      data: {
        email: parsed.data.email.toLowerCase().trim(),
        name: parsed.data.name.trim(),
        role: parsed.data.role,
        passwordHash,
        mustChangePassword: !isGuest,
        active: true,
      },
      select: { id: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return uniqueEmailErrorState();
    }
    throw err;
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/overview");

  // GUEST: the admin already knows the password they just typed, so skip
  // the temp-password reveal and return to the user list.
  if (isGuest) {
    redirect("/admin/users");
  }

  return {
    errors: {},
    message: null,
    tempPassword: password,
    createdUserId: created.id,
  };
}

export async function updateUser(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await assertRoleForAction(ADMIN_ROLES);

  const parsed = UpdateUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    active: formData.get("active"),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: null };
  }

  // Last-admin guard: don't allow demoting or deactivating the only ADMIN.
  const target = await prisma.user.findUnique({
    where: { id },
    select: { role: true, active: true },
  });
  if (!target) {
    return { errors: {}, message: "User not found." };
  }

  const isDemotingAdmin =
    target.role === "ADMIN" && parsed.data.role !== "ADMIN";
  const isDeactivatingAdmin =
    target.role === "ADMIN" && target.active && !parsed.data.active;

  if (isDemotingAdmin || isDeactivatingAdmin) {
    const activeAdmins = await prisma.user.count({
      where: { role: "ADMIN", active: true },
    });
    if (activeAdmins <= 1) {
      return {
        errors: {},
        message:
          "This is the only active Admin. Promote or activate another Admin before changing this one.",
      };
    }
  }

  try {
    await prisma.user.update({
      where: { id },
      data: {
        email: parsed.data.email.toLowerCase().trim(),
        name: parsed.data.name.trim(),
        role: parsed.data.role,
        active: parsed.data.active,
        // GUEST accounts are shared demos — never bounce them through
        // /account/change-password. Force the flag off whenever the
        // role being saved is GUEST.
        ...(parsed.data.role === "GUEST"
          ? { mustChangePassword: false }
          : {}),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return uniqueEmailErrorState();
    }
    throw err;
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}/edit`);
  revalidatePath("/admin/overview");
  redirect("/admin/users");
}

export async function resetUserPassword(
  userId: string,
): Promise<{ tempPassword: string }> {
  await assertRoleForAction(ADMIN_ROLES);

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: true,
    },
  });

  revalidatePath(`/admin/users/${userId}/edit`);
  return { tempPassword };
}

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match.",
  });

export async function changeOwnPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Not authenticated.");
  }

  const parsed = ChangePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors, message: null };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true, active: true },
  });
  if (!dbUser || !dbUser.passwordHash || !dbUser.active) {
    return { errors: {}, message: "Your account is not available." };
  }

  const valid = await bcrypt.compare(
    parsed.data.currentPassword,
    dbUser.passwordHash,
  );
  if (!valid) {
    return {
      errors: { currentPassword: ["Current password is incorrect."] },
      message: null,
    };
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      passwordHash: newHash,
      mustChangePassword: false,
    },
  });

  // Sign the user out so the next login picks up a fresh JWT with
  // mustChangePassword cleared. Otherwise the existing JWT keeps the old
  // flag and the auth middleware redirects back to /account/change-password.
  await signOut({ redirectTo: "/sign-in?changed=1" });

  return { errors: {}, message: null };
}
