import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { PrintButton } from "@/components/print-button";
import { JobNotes } from "@/components/job-notes";

export const dynamic = "force-dynamic";

const dayFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});
const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const job = await prisma.jobberJob.findUnique({
    where: { id },
    include: {
      client: true,
      property: true,
      visits: {
        orderBy: [{ startAt: "asc" }],
      },
      notes: {
        orderBy: [{ noteCreatedAt: "desc" }],
      },
      lineItems: {
        orderBy: [{ position: "asc" }],
        include: {
          item: true,
          kit: {
            include: {
              items: {
                include: { item: true },
              },
            },
          },
        },
      },
    },
  });

  if (!job) notFound();

  // Customer-level notes (also useful context when working a job).
  const clientNotes = await prisma.jobberNote.findMany({
    where: { clientId: job.clientId },
    orderBy: [{ noteCreatedAt: "desc" }],
    take: 50,
  });

  // Visit-level notes for any of this Job's visits. Surface them alongside the
  // job's own notes — from the user's perspective they're "notes on this job".
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

  return (
    <>
      <header>
        <div className="no-print mb-3">
          <PrintButton />
        </div>
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
      </header>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Customer */}
        <Card title="Customer">
          {job.client ? (
            <div className="space-y-1 text-sm">
              <div className="font-medium text-ink">{job.client.name}</div>
              {job.client.emails.length > 0 && (
                <div className="text-ink-dim">{job.client.emails.join(", ")}</div>
              )}
              {job.client.phones.length > 0 && (
                <div className="text-ink-dim">{job.client.phones.join(", ")}</div>
              )}
              {job.property?.address && (
                <div className="mt-2 text-ink-dim">{job.property.address}</div>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-dim">—</p>
          )}
        </Card>

        {/* Calendar (visits) */}
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
                  {v.title && <div className="text-xs text-ink-dim">{v.title}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>

      </div>

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

      {/* Pick List */}
      <section className="mt-6 rounded-lg border border-rule bg-card p-6 print-block">
        <header className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Pick List</h2>
            <p className="mt-1 text-sm text-ink-dim">
              Items and Kits this Job needs. For each Kit, the recipe is shown
              so you can build it from components if no pre-built unit is
              available.
            </p>
          </div>
        </header>

        {job.lineItems.length === 0 ? (
          <p className="mt-6 text-sm text-ink-dim">
            No line items on this Job yet. Re-run Sync Jobs after adding line
            items in Jobber.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {job.lineItems.map((li) => {
              const isKit = !!li.kit;
              const isItem = !!li.item;
              const qty = Number(li.quantity);

              return (
                <li
                  key={li.id}
                  className="rounded-md border border-rule bg-canvas p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <div className="font-medium text-ink">
                        {li.item?.name ?? li.kit?.name ?? li.rawName ?? "(unknown)"}
                      </div>
                      <div className="mt-1 text-xs text-ink-dim">
                        {isKit && "Kit (Service)"}
                        {isItem && "Item (Product)"}
                        {!isKit && !isItem && "Unlinked — run Sync from Inventory → Jobber"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-ink">
                        ×{qty}
                      </div>
                      {isKit && li.kit && (
                        <div className="text-xs text-ink-dim">
                          {li.kit.quantity > 0
                            ? `✓ ${li.kit.quantity} pre-built in stock`
                            : "⚠ Build from recipe"}
                        </div>
                      )}
                    </div>
                  </div>

                  {li.notes && (
                    <p className="mt-2 text-xs text-ink-dim italic">
                      {li.notes}
                    </p>
                  )}

                  {isKit && li.kit && li.kit.items.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-ink-dim hover:text-ink">
                        Recipe ({li.kit.items.length} component
                        {li.kit.items.length === 1 ? "" : "s"})
                      </summary>
                      <ul className="mt-2 space-y-1 text-xs text-ink-dim">
                        {li.kit.items.map((ki) => (
                          <li key={ki.itemId} className="flex justify-between">
                            <span>{ki.item.name}</span>
                            <span className="tabular-nums">
                              ×{ki.quantity * qty}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(job.description || job.instructions) && (
        <section className="mt-6 rounded-lg border border-rule bg-card p-6 print-block">
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
        </section>
      )}
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

