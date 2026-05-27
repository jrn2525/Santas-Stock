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
    select: { active: true, role: true },
  });
  if (!dbUser || !dbUser.active) redirect("/sign-in");

  // Trust the DB role over the JWT's cached copy so a role change (e.g. an
  // admin demoting a user) takes effect on the next request rather than only
  // after the user signs in again. requireRole and every page that reads
  // user.role then sees the live value.
  return { ...session.user, role: dbUser.role };
}

export async function requireRole(allowed: Role | Role[]) {
  const user = await requireUser();
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!list.includes(user.role)) redirect("/unauthorized");
  return user;
}

// Used inside server actions (mutations). Throws on missing/insufficient role
// so the caller can return a structured error instead of redirecting mid-action.
// Re-queries the DB on every call so a deactivated user with a still-valid
// JWT (session strategy = JWT, can't be invalidated server-side) can't
// continue mutating data after an admin has flipped their `active` flag.
// Also pulls role from the DB rather than trusting the JWT's cached value.
export async function assertRoleForAction(allowed: Role | Role[]) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Not authenticated.");
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, active: true },
  });
  if (!dbUser || !dbUser.active) {
    throw new Error("Account is not active.");
  }
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!list.includes(dbUser.role)) {
    const need = list.map(roleLabel).join(" or ");
    throw new Error(
      `You don't have permission to do this — it requires the ${need} role. You're signed in as ${roleLabel(dbUser.role)}.`,
    );
  }
  return { ...session.user, role: dbUser.role };
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
