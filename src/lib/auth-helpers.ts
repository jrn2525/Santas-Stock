import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
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
