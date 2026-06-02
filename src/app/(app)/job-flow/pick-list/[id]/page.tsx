import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { PrintButton } from "@/components/print-button";
import {
  PickListView,
  lineItemsToPickListLines,
} from "@/components/job-flow/pick-list-view";

export const dynamic = "force-dynamic";

const dayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default async function PickListDetailPage({
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
      visits: { orderBy: [{ startAt: "asc" }] },
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
    },
  });

  if (!job) notFound();

  const pickListLines = lineItemsToPickListLines(job.lineItems);

  // Consolidated crew instructions for the printout: the job's own plus each
  // visit's, deduped so shared text isn't repeated.
  const instructions = Array.from(
    new Set(
      [job.instructions, ...job.visits.map((v) => v.instructions)]
        .map((s) => s?.trim())
        .filter((s): s is string => !!s),
    ),
  );

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-dim no-print">
            <Link href="/job-flow/pick-list" className="hover:text-ink">
              ← Pick List
            </Link>
          </p>
          <h1 className="mt-2 text-3xl font-bold text-brand-hover">
            {job.title ?? "(untitled job)"}
          </h1>
          <p className="mt-1 text-sm text-ink-dim">
            {job.jobNumber && <>Job #{job.jobNumber} · </>}
            {job.client?.name ?? "—"}
            {job.startAt && <> · {dayFmt.format(job.startAt)}</>}
          </p>
          {job.property?.address && (
            <p className="mt-1 text-sm text-ink-dim">
              {job.property.address}
            </p>
          )}
        </div>
        <div className="no-print">
          <PrintButton />
        </div>
      </header>

      {instructions.length > 0 && (
        <section className="mt-8 rounded-lg border border-rule bg-card p-6 print-block">
          <h2 className="text-lg font-semibold text-ink">Instructions</h2>
          <div className="mt-3 space-y-3">
            {instructions.map((ins) => (
              <p
                key={ins}
                className="text-sm text-ink whitespace-pre-line"
              >
                {ins}
              </p>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8 rounded-lg border border-rule bg-card p-6 print-block">
        <header>
          <h2 className="text-lg font-semibold text-ink">Pick List</h2>
          <p className="mt-1 text-sm text-ink-dim no-print">
            Kits with their recipe components tabbed beneath; standalone Items
            at the top level.
          </p>
        </header>

        <div className="mt-4">
          <PickListView
            lines={pickListLines}
            emptyMessage="No line items on this Job. Re-run Sync Jobs after adding line items in Jobber."
          />
        </div>
      </section>
    </>
  );
}
