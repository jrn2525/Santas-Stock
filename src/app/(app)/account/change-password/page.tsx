import { requireUser } from "@/lib/auth-helpers";
import { ChangePasswordForm } from "@/components/change-password-form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await requireUser();

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Change password</h1>
        <p className="mt-1 text-sm text-ink-dim">
          {user.mustChangePassword
            ? "You're using a temporary password. Set a new one to continue."
            : "Pick a new password. You'll be signed out and need to sign back in."}
        </p>
      </header>

      <section className="mt-8 max-w-md rounded-lg border border-rule bg-card p-6">
        <ChangePasswordForm />
      </section>
    </>
  );
}
