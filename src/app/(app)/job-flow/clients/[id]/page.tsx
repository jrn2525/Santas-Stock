import Link from "next/link";
import { notFound } from "next/navigation";
import type { JobStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { STAGE_LABELS } from "@/lib/job-flow";
import { to2Dp } from "@/lib/format";
import { ClientStatusControls } from "@/components/client-status-controls";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
});
const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
  timeStyle: "short",
});
const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const TERMINAL_STAGES: JobStage[] = ["COMPLETE", "DEACTIVATED"];

function stageBadgeStyle(stage: JobStage): string {
  if (TERMINAL_STAGES.includes(stage)) {
    return "border-rule bg-canvas text-ink-dim";
  }
  if (stage === "NEW") {
    return "border-rule bg-canvas text-white";
  }
  return "border-brand/40 bg-brand/15 text-ink";
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const canWrite = user.role === "ADMIN" || user.role === "MANAGER";
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      properties: {
        select: {
          id: true,
          address: true,
        },
        orderBy: { address: "asc" },
      },
      jobs: {
        select: {
          id: true,
          title: true,
          jobNumber: true,
          status: true,
          currentStage: true,
          isOnHold: true,
          total: true,
          startAt: true,
          property: { select: { address: true } },
        },
        orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
      },
      customerKits: {
        select: {
          id: true,
          quantity: true,
          status: true,
          storageLocation: true,
          kit: { select: { id: true, name: true } },
          property: { select: { address: true } },
          items: {
            select: {
              quantity: true,
              item: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { kit: { name: "asc" } },
      },
    },
  });
  if (!client) notFound();

  // Quick aggregates for the header
  const jobsActive = client.jobs.filter(
    (j) => j.currentStage !== "COMPLETE" && j.currentStage !== "DEACTIVATED",
  ).length;
  const jobsCompleted = client.jobs.filter(
    (j) => j.currentStage === "COMPLETE",
  ).length;
  const jobsDeactivated = client.jobs.filter(
    (j) => j.currentStage === "DEACTIVATED",
  ).length;
  const totalKitsInTote = client.customerKits.reduce(
    (s, ck) => s + ck.quantity,
    0,
  );

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-dim">
            <Link href="/job-flow/jobs" className="hover:text-ink">
              ← Jobs
            </Link>
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <h1 className="text-3xl font-bold text-brand-hover">
              {client.name}
            </h1>
            {client.active ? (
              client.customerStatus === "EXISTING" ? (
                <span
                  className="inline-block rounded border border-green-600/40 bg-green-600/10 px-2 py-0.5 text-xs font-medium text-green-200"
                  title={
                    client.firstCompletedAt
                      ? `Existing customer since ${client.firstCompletedAt.toLocaleDateString("en-US", { timeZone: "America/New_York" })}`
                      : "Existing customer"
                  }
                >
                  Existing
                </span>
              ) : (
                <span
                  className="inline-block rounded border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-200"
                  title="New customer — no completed jobs yet"
                >
                  New
                </span>
              )
            ) : (
              <span
                className="inline-block rounded border border-red-700/40 bg-red-900/10 px-2 py-0.5 text-xs font-medium text-red-200"
                title={
                  client.deactivatedAt
                    ? `Deactivated ${dateFmt.format(client.deactivatedAt)}`
                    : "Deactivated customer"
                }
              >
                Deactivated
              </span>
            )}
          </div>
        </div>
        {canWrite && (
          <ClientStatusControls
            clientId={client.id}
            clientName={client.name}
            active={client.active}
          />
        )}
      </header>

      {!client.active && client.deactivationReason && (
        <section className="mt-4 rounded-md border border-red-700/40 bg-red-900/10 p-4 text-sm text-red-200">
          <strong className="font-semibold">Reason for deactivation:</strong>{" "}
          {client.deactivationReason}
        </section>
      )}

      {/* Top stat strip */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active jobs" value={jobsActive.toString()} />
        <StatCard label="Completed jobs" value={jobsCompleted.toString()} />
        <StatCard label="Deactivated jobs" value={jobsDeactivated.toString()} />
        <StatCard label="Kits in tote" value={to2Dp(totalKitsInTote)} />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Contact">
          <dl className="space-y-2 text-sm">
            {client.emails.length > 0 && (
              <Row label="Email" value={client.emails.join(", ")} />
            )}
            {client.phones.length > 0 && (
              <Row label="Phone" value={client.phones.join(", ")} />
            )}
            {client.serviceStreet1 && (
              <Row
                label="Service address"
                value={[
                  client.serviceStreet1,
                  [client.serviceCity, client.serviceState, client.serviceZip]
                    .filter(Boolean)
                    .join(", "),
                ]
                  .filter(Boolean)
                  .join(" — ")}
              />
            )}
            {client.companyName && (
              <Row label="Company" value={client.companyName} />
            )}
            {client.tags.length > 0 && (
              <Row label="Tags" value={client.tags.join(", ")} />
            )}
          </dl>
        </Card>

        <Card title={`Properties (${client.properties.length})`}>
          {client.properties.length === 0 ? (
            <p className="text-sm text-ink-dim">No properties on file.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {client.properties.map((p) => (
                <li key={p.id} className="text-ink">
                  {p.address}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Customer kits in storage */}
      <section className="mt-6 rounded-lg border border-rule bg-card p-6">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">In storage</h2>
          <span className="text-xs text-ink-dim">
            Pre-built kits the customer owns, sitting in their tote
            between seasons
          </span>
        </header>

        {client.customerKits.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">
            No customer kits in storage. This appears once a job
            reaches Ready (COMPLETE) and a kit goes into the tote.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {client.customerKits.map((ck) => (
              <li
                key={ck.id}
                className="rounded-md border border-rule bg-canvas p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <div className="font-semibold text-ink">
                      {ck.kit.name}
                    </div>
                    <div className="text-xs text-ink-dim">
                      {ck.property?.address && (
                        <>{ck.property.address} · </>
                      )}
                      {ck.storageLocation && (
                        <>Stored at {ck.storageLocation} · </>
                      )}
                      Status: {ck.status.replace("_", " ").toLowerCase()}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-ink tabular-nums whitespace-nowrap">
                    ×{ck.quantity}
                  </span>
                </div>
                {ck.items.length > 0 && (
                  <ul className="mt-2 ml-4 space-y-0.5 border-l border-rule pl-3 text-xs text-ink-dim">
                    {ck.items.map((cki) => (
                      <li
                        key={cki.item.id}
                        className="flex items-baseline justify-between gap-3"
                      >
                        <Link
                          href={`/inventory/items/${cki.item.id}`}
                          className="truncate hover:text-brand"
                        >
                          {cki.item.name}
                        </Link>
                        <span className="tabular-nums whitespace-nowrap">
                          ×{cki.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Job history */}
      <section className="mt-6 rounded-lg border border-rule bg-card p-6">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">
            Job history ({client.jobs.length})
          </h2>
          <span className="text-xs text-ink-dim">Newest first</span>
        </header>

        {client.jobs.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">No jobs on record.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-md border border-rule">
            <table className="w-full text-sm">
              <thead className="bg-card text-left text-xs uppercase tracking-wider text-ink-dim">
                <tr>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Property</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Scheduled</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule bg-canvas">
                {client.jobs.map((j) => (
                  <tr key={j.id} className="text-ink hover:bg-card/40">
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/job-flow/jobs/${j.id}`}
                        className="hover:text-brand"
                      >
                        {j.jobNumber && (
                          <span className="text-ink-dim">
                            #{j.jobNumber} ·{" "}
                          </span>
                        )}
                        {j.title ?? "(untitled)"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-dim">
                      {j.property?.address ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${stageBadgeStyle(j.currentStage)}`}
                        >
                          {STAGE_LABELS[j.currentStage]}
                        </span>
                        {j.isOnHold && (
                          <span
                            className="inline-block rounded border border-yellow-600/40 bg-yellow-500/15 px-2 py-0.5 text-xs font-medium text-yellow-200"
                            title="Job is on hold for shortages"
                          >
                            Awaiting Stock
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-dim">
                      {j.startAt ? dateTimeFmt.format(j.startAt) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {j.total ? moneyFmt.format(Number(j.total)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-rule bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-ink-dim">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-ink tabular-nums">
        {value}
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-rule bg-card p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <dt className="text-ink-dim">{label}:</dt>
      <dd className="flex-1 text-ink">{value}</dd>
    </div>
  );
}
