import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, roleLabel } from "@/lib/auth-helpers";
import { getSettings } from "@/lib/settings";
import { fmtLongDateET } from "@/lib/datetime";
import { SettingsForm } from "@/components/settings-form";
import { ChangePasswordForm } from "@/components/change-password-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  // Admins and Managers also get the app-wide settings below; everyone sees
  // their own account + password.
  const canManage = user.role === "ADMIN" || user.role === "MANAGER";

  const settings = canManage ? await getSettings() : null;
  const jobber = canManage
    ? await prisma.jobberConnection.findFirst({
        include: { connectedBy: { select: { name: true } } },
      })
    : null;

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Settings</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Your account
          {canManage ? ", plus app-wide defaults that take effect everywhere" : " and password"}
          .
        </p>
      </header>

      {/* Your account — available to every signed-in user */}
      <section className="mt-8 max-w-3xl rounded-lg border border-rule bg-card p-6">
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

      <section className="mt-8 max-w-3xl rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Change password</h2>
        {user.role === "GUEST" ? (
          <p className="mt-1 text-sm text-ink-dim">
            This is a shared read-only demo account, so its password can&apos;t
            be changed here.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-dim">
              You&apos;ll be signed out after changing your password. Sign back
              in with the new one.
            </p>
            <ChangePasswordForm />
          </>
        )}
      </section>

      {canManage && settings && (
        <>
          <SettingsForm settings={settings} />

          <section className="mt-8 max-w-3xl rounded-lg border border-rule bg-card p-6">
            <h2 className="text-lg font-semibold text-ink">Jobber &amp; sync</h2>
            {jobber ? (
              <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <Pair label="Status" value="Connected" />
                <Pair label="Account" value={jobber.accountName ?? "—"} />
                <Pair
                  label="Connected by"
                  value={jobber.connectedBy?.name ?? "—"}
                />
                <Pair
                  label="Connected on"
                  value={fmtLongDateET(jobber.connectedAt)}
                />
              </dl>
            ) : (
              <p className="mt-3 text-sm text-ink-dim">
                Not connected to Jobber.
              </p>
            )}
            <p className="mt-4 text-xs text-ink-dim">
              Manage the connection on the{" "}
              <Link href="/job-flow/jobber" className="text-brand underline">
                Jobber connection
              </Link>{" "}
              page, or run a catalog sync from{" "}
              <Link href="/inventory/jobber" className="text-brand underline">
                Inventory → Jobber
              </Link>
              .
            </p>
          </section>
        </>
      )}
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
