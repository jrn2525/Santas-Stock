import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole, ADMIN_ROLES } from "@/lib/auth-helpers";
import { getSettings } from "@/lib/settings";
import { fmtLongDateET } from "@/lib/datetime";
import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole(ADMIN_ROLES);

  const [settings, jobber] = await Promise.all([
    getSettings(),
    prisma.jobberConnection.findFirst({
      include: { connectedBy: { select: { name: true } } },
    }),
  ]);

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Settings</h1>
        <p className="mt-1 text-sm text-ink-dim">
          App-wide defaults. Changes take effect across every page.
        </p>
      </header>

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
