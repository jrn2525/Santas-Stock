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
