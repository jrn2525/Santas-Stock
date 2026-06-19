import Link from "next/link";
import { WRITE_ROLES, requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { disconnectJobber } from "@/lib/actions/jobber";
import {
  JobberJobsSyncButton,
} from "@/components/jobber-job-flow-sync-buttons";
import { dateTimeFormatET } from "@/lib/datetime";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  invalid_state: "Authorization request didn't match — please try again.",
  missing_code: "Jobber didn't return a code. Try again.",
  token_exchange:
    "Jobber rejected the token exchange. Check the Client ID and Secret in Railway, then retry.",
  access_denied: "Authorization was cancelled.",
};

const dateFormatter = dateTimeFormatET;

async function disconnectAction() {
  "use server";
  await disconnectJobber();
}

export default async function JobberPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  await requireRole(WRITE_ROLES);
  const params = await searchParams;
  const connection = await prisma.jobberConnection.findFirst({
    include: { connectedBy: { select: { name: true, email: true } } },
  });

  // Recent webhook deliveries Jobber pushed to /api/jobber/webhook. Only
  // signature-verified events are recorded, so this also tells us whether
  // Jobber is actually reaching the app.
  const recentEvents = await prisma.syncEvent.findMany({
    where: { source: "jobber" },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true,
      eventType: true,
      status: true,
      error: true,
      createdAt: true,
      processedAt: true,
    },
  });

  const errorMsg = params.error ? errorMessages[params.error] ?? params.error : null;
  const justConnected = params.connected === "1";

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Jobber connection</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Connect Santa&apos;s Stock to your Jobber account so customer, property,
          and job data syncs automatically.
        </p>
      </header>

      {errorMsg && (
        <div className="mt-6 rounded-md border border-brand bg-brand/10 p-4 text-sm text-brand">
          {errorMsg}
        </div>
      )}

      {justConnected && (
        <div className="mt-6 rounded-md border border-rule bg-card p-4 text-sm text-ink">
          ✓ Connected successfully.
        </div>
      )}

      <section className="mt-8 rounded-lg border border-rule bg-card p-6">
        {connection ? (
          <div className="space-y-3">
            <div className="text-lg font-semibold text-ink">✓ Connected</div>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <Pair
                label="Connected by"
                value={
                  connection.connectedBy
                    ? `${connection.connectedBy.name} (${connection.connectedBy.email})`
                    : "—"
                }
              />
              <Pair
                label="Connected at"
                value={dateFormatter.format(connection.connectedAt)}
              />
              <Pair
                label="Token expires"
                value={dateFormatter.format(connection.expiresAt)}
              />
              <Pair
                label="Scopes"
                value={connection.scopes.length ? connection.scopes.join(", ") : "—"}
              />
            </dl>

            <div className="mt-6 flex gap-3 border-t border-rule pt-6">
              <a
                href="/api/jobber/connect"
                className="rounded-md border border-rule bg-canvas px-3 py-2 text-sm font-medium text-ink hover:border-brand hover:text-brand"
              >
                Reconnect
              </a>
              <form action={disconnectAction}>
                <button
                  type="submit"
                  className="rounded-md border border-brand bg-canvas px-3 py-2 text-sm font-medium text-brand hover:bg-brand hover:text-ink"
                >
                  Disconnect
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-lg font-semibold text-ink">Not connected</div>
            <p className="text-sm text-ink-dim">
              Click below to authorize Santa&apos;s Stock against your Jobber account.
              You&apos;ll be redirected to Jobber to approve the connection, then
              back here.
            </p>
            <a
              href="/api/jobber/connect"
              className="mt-4 inline-block rounded-md bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-hover"
            >
              Connect to Jobber
            </a>
          </div>
        )}
      </section>

      {connection && (
        <section className="mt-6 rounded-lg border border-rule bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">Job Flow sync</h2>
              <p className="mt-1 text-sm text-ink-dim">
                Pull Customers + Properties, Jobs, Visits, Invoices, and Notes
                from Jobber in one click.
              </p>
            </div>
            <Link
              href="/job-flow/jobber/logs"
              className="rounded-md border border-rule bg-canvas px-3 py-2 text-sm font-medium text-ink hover:border-brand hover:text-brand"
            >
              View logs
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            <JobberJobsSyncButton />
          </div>
        </section>
      )}

      <section className="mt-6 rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Recent webhook events</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Live changes Jobber pushed to this app (newest first). If you change
          something in Jobber and nothing shows up here within a minute, then
          Jobber isn&apos;t reaching the app — the problem is webhook delivery,
          not the sync.
        </p>
        {recentEvents.length === 0 ? (
          <p className="mt-4 text-sm text-ink-dim">
            No webhook events received yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-rule">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-canvas text-left text-xs uppercase tracking-wider text-ink-dim">
                <tr>
                  <th className="px-4 py-2">Received</th>
                  <th className="px-4 py-2">Event</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {recentEvents.map((e) => (
                  <tr key={e.id} className="text-ink">
                    <td className="px-4 py-2 whitespace-nowrap text-ink-dim">
                      {dateFormatter.format(e.createdAt)}
                    </td>
                    <td className="px-4 py-2 font-medium">{e.eventType}</td>
                    <td className="px-4 py-2">
                      <span className={statusClass(e.status)}>{e.status}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-ink-dim">
                      {e.error ?? (e.processedAt ? "Synced" : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 text-xs text-ink-dim">
        <p>
          Need to change Jobber app settings? Visit{" "}
          <Link
            href="https://developer.getjobber.com"
            target="_blank"
            className="underline hover:text-ink"
          >
            developer.getjobber.com
          </Link>
          .
        </p>
      </section>
    </>
  );
}

function statusClass(status: string): string {
  if (status === "PROCESSED") return "font-medium text-green-400";
  if (status === "FAILED") return "font-medium text-brand";
  return "text-ink-dim"; // PENDING
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-dim">{label}</dt>
      <dd className="mt-1 text-ink">{value}</dd>
    </div>
  );
}
