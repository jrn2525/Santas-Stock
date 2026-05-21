import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  // Defensive check: a deactivated user shouldn't be able to keep using
  // a still-valid JWT. Re-query the DB on every gated route to enforce.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { active: true },
  });
  if (!dbUser || !dbUser.active) redirect("/sign-in");

  return session.user;
}

export async function requireRole(allowed: Role | Role[]) {
  const user = await requireUser();
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!list.includes(user.role)) redirect("/unauthorized");
  return user;
}

// Used inside server actions (mutations). Throws on missing/insufficient role
// so the caller can return a structured error instead of redirecting mid-action.
export async function assertRoleForAction(allowed: Role | Role[]) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Not authenticated.");
  }
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!list.includes(session.user.role)) {
    throw new Error("You do not have permission to perform this action.");
  }
  return session.user;
}

export const WRITE_ROLES: Role[] = ["ADMIN", "MANAGER"];
export const ADMIN_ROLES: Role[] = ["ADMIN"];

// Display label for a Role. USER is stored as USER in the DB but
// presented to humans as "Crew". GUEST is the read-only demo role.
export function roleLabel(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "MANAGER":
      return "Manager";
    case "USER":
      return "Crew";
    case "GUEST":
      return "Guest";
  }
}
