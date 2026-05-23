import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, requireRole } from "@/lib/auth-helpers";
import { EditUserForm } from "@/components/user-form";
import { ResetPasswordButton } from "@/components/reset-password-button";

export const dynamic = "force-dynamic";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(ADMIN_ROLES);
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      mustChangePassword: true,
    },
  });

  if (!user) notFound();

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Edit user</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Update profile, role, or status. Use the reset-password button below
          to issue a new temporary password.
        </p>
      </header>

      <EditUserForm user={user} />

      <section className="mt-10 rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Password</h2>
        <p className="mt-1 text-sm text-ink-dim">
          {user.mustChangePassword
            ? "This user has a pending temporary password and must change it on next login."
            : "Generate a new temporary password. The user's current password will stop working immediately and they'll be forced to change it on next login."}
        </p>
        <div className="mt-4">
          <ResetPasswordButton userId={user.id} userEmail={user.email} />
        </div>
      </section>
    </>
  );
}
