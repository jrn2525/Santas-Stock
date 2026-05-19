import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { PickListNotes } from "@/components/pick-list-notes";

export const dynamic = "force-dynamic";

const dayFmt = new Intl.DateTimeFormat("en-US", {
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
    },
  });

  if (!job) notFound();

  const clientNotes = await prisma.jobberNote.findMany({
    where: { clientId: job.clientId },
    orderBy: [{ noteCreatedAt: "desc" }],
    take: 100,
  });

  const kitLines = job.lineItems.filter((li) => li.kit);
  const itemLines = job.lineItems.filter((li) => li.item && !li.kit);
  const unresolvedLines = job.lineItems.filter((li) => !li.item && !li.kit);

  return (
    <>
      <header className="flex items-start justify-between gap-4">
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
      </header>

      <section className="mt-8 rounded-lg border border-rule bg-card p-6 print-block">
        <header>
          <h2 className="text-lg font-semibold text-ink">Pick List</h2>
          <p className="mt-1 text-sm text-ink-dim no-print">
            Kits with recipe components, plus standalone Items needed for this
            job.
          </p>
        </header>

        {job.lineItems.length === 0 ? (
          <p className="mt-6 text-sm text-ink-dim">
            No line items on this Job. Re-run Sync Jobs after adding line
            items in Jobber.
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {kitLines.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-ink-dim">
                  Kits
                </h3>
                <ul className="mt-2 space-y-3">
                  {kitLines.map((li) => {
                    const kit = li.kit!;
                    const qty = Number(li.quantity);
                    return (
                      <li
                        key={li.id}
                        className="rounded-md border border-rule bg-canvas p-4 pick-list-kit"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="font-medium text-ink">
                            {kit.name}
                          </div>
                          <div className="text-sm font-medium text-ink tabular-nums">
                            ×{qty}
                          </div>
                        </div>
                        {li.notes && (
                          <p className="mt-1 text-xs italic text-ink-dim">
                            {li.notes}
                          </p>
                        )}
                        {kit.items.length > 0 && (
                          <ul className="mt-3 space-y-1 border-t border-rule pt-3 text-sm">
                            {kit.items.map((ki) => (
                              <li
                                key={ki.itemId}
                                className="flex justify-between text-ink-dim"
                              >
                                <span>{ki.item.name}</span>
                                <span className="tabular-nums">
                                  ×{ki.quantity * qty}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {itemLines.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-ink-dim">
                  Items
                </h3>
                <ul className="mt-2 space-y-2">
                  {itemLines.map((li) => {
                    const item = li.item!;
                    const qty = Number(li.quantity);
                    return (
                      <li
                        key={li.id}
                        className="flex items-baseline justify-between rounded-md border border-rule bg-canvas p-3"
                      >
                        <div>
                          <div className="font-medium text-ink">
                            {item.name}
                          </div>
                          {li.notes && (
                            <p className="mt-1 text-xs italic text-ink-dim">
                              {li.notes}
                            </p>
                          )}
                        </div>
                        <div className="text-sm font-medium text-ink tabular-nums">
                          ×{qty}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {unresolvedLines.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-ink-dim">
                  Unresolved
                </h3>
                <p className="mt-1 text-xs text-ink-dim no-print">
                  These line items aren&apos;t linked to a local Item or Kit.
                  Run Inventory → Jobber sync to link them.
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {unresolvedLines.map((li) => (
                    <li
                      key={li.id}
                      className="flex justify-between rounded border border-rule bg-canvas px-3 py-2 text-ink-dim"
                    >
                      <span>{li.rawName ?? "(unnamed)"}</span>
                      <span className="tabular-nums">
                        ×{Number(li.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <PickListNotes
        jobNotes={job.notes.map((n) => ({
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
    </>
  );
}
