import Link from "next/link";
import { WRITE_ROLES, requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { disconnectJobber } from "@/lib/actions/jobber";
import {
  JobberJobsSyncButton,
} from "@/components/jobber-job-flow-sync-buttons";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  invalid_state: "Authorization request didn't match — please try again.",
  missing_code: "Jobber didn't return a code. Try again.",
  token_exchange:
    "Jobber rejected the token exchange. Check the Client ID and Secret in Railway, then retry.",
  access_denied: "Authorization was cancelled.",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

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
          <h2 className="text-lg font-semibold text-ink">Job Flow sync</h2>
          <p className="mt-1 text-sm text-ink-dim">
            Pull Customers + Properties, Jobs, Visits, and Notes from Jobber
            in one click.
          </p>
          <div className="mt-4 space-y-3">
            <JobberJobsSyncButton />
          </div>
        </section>
      )}

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

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-dim">{label}</dt>
      <dd className="mt-1 text-ink">{value}</dd>
    </div>
  );
}
