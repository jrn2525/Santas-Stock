import { ADMIN_ROLES, requireRole } from "@/lib/auth-helpers";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(ADMIN_ROLES);
  return <>{children}</>;
}
