import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { PrintButton } from "@/components/print-button";
import { JobNotes } from "@/components/job-notes";
import { JobFlowChart } from "@/components/job-flow/job-flow-chart";
import { ServiceCallFlowCard } from "@/components/job-flow/service-call-flow-card";
import { jobHasServiceCall } from "@/lib/service-call";
import {
  PickListView,
  lineItemsToPickListLines,
} from "@/components/job-flow/pick-list-view";
import { ChangeOrderHistory } from "@/components/job-flow/change-order-history";
import { ResetJobButton } from "@/components/job-flow/reset-job-button";
import { longDateFormatET, timeFormatET } from "@/lib/datetime";

export const dynamic = "force-dynamic";

const dayFmt = longDateFormatET;
const timeFmt = timeFormatET;
const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const canWrite = user.role === "ADMIN" || user.role === "MANAGER";
  const { id } = await params;

  const job = await prisma.jobberJob.findUnique({
    where: { id },
    include: {
      client: true,
      property: true,
      visits: { orderBy: [{ startAt: "asc" }] },
      notes: { orderBy: [{ noteCreatedAt: "desc" }] },
      lineItems: {
        orderBy: [{ position: "asc" }],
        include: {
          item: true,
          kit: {
            include: {
              items: {
                include: { item: true },
                orderBy: { item: { name: "asc" } },
              },
            },
          },
        },
      },
      changeOrders: {
        orderBy: { createdAt: "desc" },
        include: { createdBy: { select: { name: true } } },
      },
    },
  });

  if (!job) notFound();

  // Service Call jobs (labor-only) use the simplified 3-step flow card.
  const isServiceCall = jobHasServiceCall(job.lineItems);

  const clientNotes = await prisma.jobberNote.findMany({
    where: { clientId: job.clientId },
    orderBy: [{ noteCreatedAt: "desc" }],
    take: 50,
  });

  const visitIds = job.visits.map((v) => v.id);
  const visitNotes = visitIds.length
    ? await prisma.jobberNote.findMany({
        where: { visitId: { in: visitIds } },
        orderBy: [{ noteCreatedAt: "desc" }],
      })
    : [];

  const jobAndVisitNotes = [...job.notes, ...visitNotes].sort((a, b) => {
    const aT = a.noteCreatedAt?.getTime() ?? 0;
    const bT = b.noteCreatedAt?.getTime() ?? 0;
    return bT - aT;
  });

  // Crew instructions live on the visit in Jobber, separate from the job's own
  // instructions. Show them, deduped and excluding any that just repeat the
  // job instructions.
  const jobInstructions = job.instructions?.trim() || null;
  const visitInstructions = Array.from(
    new Set(
      job.visits
        .map((v) => v.instructions?.trim())
        .filter((s): s is string => !!s && s !== jobInstructions),
    ),
  );

  const pickListLines = lineItemsToPickListLines(job.lineItems);

  // Customer tote summary: how many kit copies this client has across
  // all CustomerKit rows. Cheap aggregate so the Customer card can
  // surface "Has N kits in storage" at a glance.
  const customerKitAgg = job.clientId
    ? await prisma.customerKit.aggregate({
        where: { clientId: job.clientId },
        _sum: { quantity: true },
        _count: { _all: true },
      })
    : null;
  const totalKitsInTote = customerKitAgg?._sum.quantity ?? 0;
  const totalKitTypes = customerKitAgg?._count._all ?? 0;

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-dim no-print">
            <Link href="/job-flow/jobs" className="hover:text-ink">
              ← Jobs
            </Link>
          </p>
          <h1 className="mt-2 text-3xl font-bold text-brand-hover">
            {job.title ?? "(untitled job)"}
          </h1>
          <p className="mt-1 text-sm text-ink-dim">
            {job.jobNumber && <>Job #{job.jobNumber} · </>}
            Status: {job.status || "—"}
            {job.total != null && (
              <> · Total {moneyFmt.format(Number(job.total))}</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          {user.role === "ADMIN" && !isServiceCall && (
            <ResetJobButton jobId={job.id} />
          )}
          <PrintButton />
        </div>
      </header>

      {job.isOnHold && (
        <Link
          href={`/job-flow/jobs/${job.id}/awaiting-stock`}
          className="mt-4 flex items-start justify-between gap-3 rounded-md border border-yellow-600/60 bg-yellow-500/15 px-4 py-3 text-sm text-yellow-100 transition hover:border-yellow-500 hover:bg-yellow-500/25"
        >
          <span>
            <strong className="font-semibold">Awaiting Stock.</strong> This job
            is waiting on inventory to come in before it can advance.
          </span>
          <span className="text-xs uppercase tracking-wider text-yellow-200">
            View shortages →
          </span>
        </Link>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* LEFT — Job Information cards */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Card title="Customer">
              {job.client ? (
                <div className="space-y-1 text-sm">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Link
                      href={`/job-flow/clients/${job.client.id}`}
                      className="font-medium text-ink hover:text-brand"
                    >
                      {job.client.name}
                    </Link>
                    {!job.client.active ? (
                      <span
                        className="inline-block rounded border border-red-700/40 bg-red-900/10 px-2 py-0.5 text-xs font-medium text-red-200"
                        title={
                          job.client.deactivatedAt
                            ? `Deactivated ${job.client.deactivatedAt.toLocaleDateString("en-US", { timeZone: "America/New_York" })}`
                            : "Deactivated customer"
                        }
                      >
                        Deactivated
                      </span>
                    ) : job.client.customerStatus === "EXISTING" ? (
                      <span
                        className="inline-block rounded border border-green-600/40 bg-green-600/10 px-2 py-0.5 text-xs font-medium text-green-200"
                        title={
                          job.client.firstCompletedAt
                            ? `Existing customer since ${job.client.firstCompletedAt.toLocaleDateString("en-US", { timeZone: "America/New_York" })}`
                            : "Existing customer — has had at least one job reach Ready"
                        }
                      >
                        Existing
                      </span>
                    ) : (
                      <span
                        className="inline-block rounded border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-200"
                        title="New customer — first time through the job flow. Flips to Existing when any of their jobs reach Ready."
                      >
                        New
                      </span>
                    )}
                  </div>
                  {job.client.emails.length > 0 && (
                    <div className="text-ink-dim">
                      {job.client.emails.map((email) => (
                        <div key={email}>{email}</div>
                      ))}
                    </div>
                  )}
                  {job.client.phones.length > 0 && (
                    <div className="text-ink-dim">
                      {job.client.phones.map((phone) => (
                        <div key={phone}>{phone}</div>
                      ))}
                    </div>
                  )}
                  {(() => {
                    // Prefer the synced Property address; fall back to the
                    // client's service address (already synced) so an address
                    // still shows for jobs without a linked property.
                    const region = [
                      job.client.serviceState,
                      job.client.serviceZip,
                    ]
                      .filter((p) => p && p.trim())
                      .join(" ");
                    const fallback = [
                      job.client.serviceStreet1,
                      job.client.serviceCity,
                      region,
                    ]
                      .filter((p) => p && p.trim())
                      .join(", ");
                    const address = job.property?.address || fallback;
                    return address ? (
                      <div className="mt-2 text-ink-dim">{address}</div>
                    ) : null;
                  })()}
                  {totalKitsInTote > 0 && (
                    <div className="mt-2 text-xs text-green-200">
                      In tote: {totalKitsInTote} kit
                      {totalKitsInTote === 1 ? "" : "s"} across{" "}
                      {totalKitTypes} type{totalKitTypes === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ink-dim">—</p>
              )}
            </Card>

            <Card title="Calendar">
              {job.visits.length === 0 ? (
                <p className="text-sm text-ink-dim">No visits scheduled.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {job.visits.map((v) => (
                    <li key={v.id} className="flex flex-col gap-0.5">
                      <div className="font-medium text-ink">
                        {v.startAt ? dayFmt.format(v.startAt) : "(no date)"}
                      </div>
                      <div className="text-ink-dim">
                        {v.startAt && timeFmt.format(v.startAt)}
                        {v.endAt && ` – ${timeFmt.format(v.endAt)}`}
                        {v.status && ` · ${v.status}`}
                      </div>
                      {v.title && (
                        <div className="text-xs text-ink-dim">{v.title}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <section className="rounded-lg border border-rule bg-card p-6 print-block">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-ink">Pick List</h2>
                <p className="mt-1 text-sm text-ink-dim">
                  Items and Kits this Job needs. For each Kit, the recipe is
                  shown with components tabbed underneath.
                </p>
              </div>
              {canWrite && (
                <Link
                  href={`/job-flow/jobs/${job.id}/change-order`}
                  className="no-print whitespace-nowrap rounded-md border border-rule bg-canvas px-4 py-2 text-sm font-medium text-ink hover:border-brand hover:text-brand"
                >
                  Change Order
                </Link>
              )}
            </header>
            <div className="mt-4">
              <PickListView
                lines={pickListLines}
                emptyMessage="No line items on this Job yet. Re-run Sync Jobs after adding line items in Jobber."
              />
            </div>
          </section>

          <JobNotes
            jobNotes={jobAndVisitNotes.map((n) => ({
              id: n.id,
              body: n.body,
              noteCreatedAt: n.noteCreatedAt?.toISOString() ?? null,
            }))}
            clientNotes={clientNotes.map((n) => ({
              id: n.id,
              body: n.body,
              noteCreatedAt: n.noteCreatedAt?.toISOString() ?? null,
            }))}
          />

          {(job.description || job.instructions || visitInstructions.length > 0) && (
            <section className="rounded-lg border border-rule bg-card p-6 print-block">
              <h2 className="text-lg font-semibold text-ink">Details</h2>
              {job.description && (
                <div className="mt-3">
                  <h3 className="text-xs uppercase tracking-wider text-ink-dim">
                    Description
                  </h3>
                  <p className="mt-1 text-sm text-ink whitespace-pre-line">
                    {job.description}
                  </p>
                </div>
              )}
              {job.instructions && (
                <div className="mt-3">
                  <h3 className="text-xs uppercase tracking-wider text-ink-dim">
                    Instructions
                  </h3>
                  <p className="mt-1 text-sm text-ink whitespace-pre-line">
                    {job.instructions}
                  </p>
                </div>
              )}
              {visitInstructions.length > 0 && (
                <div className="mt-3">
                  <h3 className="text-xs uppercase tracking-wider text-ink-dim">
                    Visit instructions
                  </h3>
                  {visitInstructions.map((ins) => (
                    <p
                      key={ins}
                      className="mt-1 text-sm text-ink whitespace-pre-line"
                    >
                      {ins}
                    </p>
                  ))}
                </div>
              )}
            </section>
          )}

          {job.changeOrders.length > 0 && (
            <ChangeOrderHistory
              entries={job.changeOrders.map((co) => ({
                id: co.id,
                atStage: co.atStage,
                reason: co.reason,
                createdAt: co.createdAt.toISOString(),
                createdByName: co.createdBy?.name ?? null,
                diff: co.diff,
              }))}
            />
          )}
        </div>

        {/* RIGHT — Job Flow chart (Service Call jobs get the 3-step card) */}
        <aside className="no-print lg:sticky lg:top-6 lg:self-start">
          {isServiceCall ? (
            <ServiceCallFlowCard
              jobId={job.id}
              scheduled={job.visits.some((v) => v.startAt != null)}
              completed={job.serviceCallCompletedAt != null}
              canWrite={canWrite}
            />
          ) : (
            <JobFlowChart
              jobId={job.id}
              currentStage={job.currentStage}
              isOnHold={job.isOnHold}
              canWrite={canWrite}
            />
          )}
        </aside>
      </div>
    </>
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
    <section className="rounded-lg border border-rule bg-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
