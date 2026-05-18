import { requireUser, roleLabel } from "@/lib/auth-helpers";
import { ChangePasswordForm } from "@/components/change-password-form";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">My account</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Your profile and password.
        </p>
      </header>

      <section className="mt-8 rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Profile</h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <Pair label="Name" value={user.name ?? "—"} />
          <Pair label="Email" value={user.email ?? "—"} />
          <Pair label="Role" value={roleLabel(user.role)} />
        </dl>
        <p className="mt-4 text-xs text-ink-dim">
          Need a change to your name, email, or role? Ask an Admin.
        </p>
      </section>

      <section className="mt-8 rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Change password</h2>
        <p className="mt-1 text-sm text-ink-dim">
          You&apos;ll be signed out after changing your password. Sign back in
          with the new one.
        </p>
        <ChangePasswordForm />
      </section>
    </>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-dim">{label}</dt>
      <dd className="mt-1 text-ink">{value}</dd>
    </div>
  );
}
