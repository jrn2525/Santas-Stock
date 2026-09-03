import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, requireRole } from "@/lib/auth-helpers";
import { EditUserForm } from "@/components/user-form";
import { ResetPasswordButton } from "@/components/reset-password-button";
import { SetPasswordForm } from "@/components/set-password-form";
import { DeleteUserButton } from "@/components/delete-user-button";

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
        {user.mustChangePassword && (
          <p className="mt-1 text-sm text-ink-dim">
            This user has a pending temporary password and must change it on
            next login.
          </p>
        )}

        <div className="mt-4">
          <h3 className="text-sm font-semibold text-ink">
            Set a password yourself
          </h3>
          <p className="mt-1 text-sm text-ink-dim">
            Choose the password and hand it to them. Their current password
            stops working immediately.
          </p>
          <div className="mt-3">
            <SetPasswordForm userId={user.id} userEmail={user.email} />
          </div>
        </div>

        <div className="mt-8 border-t border-rule pt-6">
          <h3 className="text-sm font-semibold text-ink">
            Or generate a temporary one
          </h3>
          <p className="mt-1 text-sm text-ink-dim">
            Creates a random password and forces them to choose their own at
            next login. Their current password stops working immediately.
          </p>
          <div className="mt-3">
            <ResetPasswordButton userId={user.id} userEmail={user.email} />
          </div>
        </div>
      </section>

      <section className="mt-10 rounded-lg border border-red-700/40 bg-red-900/10 p-6">
        <h2 className="text-lg font-semibold text-ink">Delete user</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Permanently remove this account. They&apos;ll no longer be able to
          sign in. Past activity stays in the records but is no longer
          attributed to them. This cannot be undone.
        </p>
        <div className="mt-4">
          <DeleteUserButton userId={user.id} userEmail={user.email} />
        </div>
      </section>
    </>
  );
}
