import { ADMIN_ROLES, requireRole } from "@/lib/auth-helpers";
import { NewUserForm } from "@/components/user-form";

export default async function NewUserPage() {
  await requireRole(ADMIN_ROLES);

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">New user</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Creates an account with a one-time temporary password. The user must
          change it on first login.
        </p>
      </header>
      <NewUserForm />
    </>
  );
}
