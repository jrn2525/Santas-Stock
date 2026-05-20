import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, WRITE_ROLES } from "@/lib/auth-helpers";
import { ReleaseButton } from "@/components/job-flow/release-button";

export const dynamic = "force-dynamic";

export default async function AwaitingStockPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(WRITE_ROLES);
  const { id } = await params;

  const job = await prisma.jobberJob.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      jobNumber: true,
      isOnHold: true,
      currentStage: true,
    },
  });
  if (!job) notFound();

  // Pull every shortage for this job grouped by line, with item availability now
  const shortages = await prisma.jobLineShortage.findMany({
    where: { jobLineItem: { jobId: job.id } },
    include: {
      item: {
        select: { id: true, name: true, quantity: true, sku: true },
      },
      jobLineItem: {
        include: {
          kit: { select: { name: true } },
          item: { select: { name: true } },
        },
      },
    },
    orderBy: [{ jobLineItemId: "asc" }, { itemId: "asc" }],
  });

  // Determine if every shortage is now covered by current inventory
  const allCovered =
    shortages.length === 0 ||
    shortages.every((s) => s.item.quantity >= s.quantityShort);

  // Group shortages by line for display
  const byLine = new Map<
    string,
    {
      lineName: string;
      lineKind: "kit" | "item";
      shortages: typeof shortages;
    }
  >();
  for (const s of shortages) {
    const lineId = s.jobLineItemId;
    if (!byLine.has(lineId)) {
      byLine.set(lineId, {
        lineName:
          s.jobLineItem.kit?.name ??
          s.jobLineItem.item?.name ??
          "(unnamed line)",
        lineKind: s.jobLineItem.kit ? "kit" : "item",
        shortages: [],
      });
    }
    byLine.get(lineId)!.shortages.push(s);
  }

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-dim">
            <Link href={`/job-flow/jobs/${job.id}`} className="hover:text-ink">
              ← {job.title ?? "Job"}
            </Link>
          </p>
          <h1 className="mt-2 text-3xl font-bold text-brand-hover">
            Awaiting Stock
          </h1>
          <p className="mt-1 text-sm text-ink-dim">
            {job.jobNumber && <>Job #{job.jobNumber} · </>}
            {shortages.length === 0
              ? "No shortages remaining — release to advance the job."
              : `Waiting on ${shortages.length} item${shortages.length === 1 ? "" : "s"} to come in.`}
          </p>
        </div>
        <ReleaseButton jobId={job.id} canRelease={allCovered} />
      </header>

      {shortages.length === 0 ? (
        <section className="mt-8 rounded-md border border-green-700/40 bg-green-900/20 p-6 text-sm text-green-100">
          All shortages are cleared. Click Release to finalize the allocation
          and move this job forward.
        </section>
      ) : (
        <section className="mt-8 rounded-lg border border-yellow-600/50 bg-yellow-500/10 p-6">
          <p className="text-sm text-yellow-100">
            <strong className="font-semibold">Waiting on inventory.</strong>{" "}
            Once stock for the items below is added (via Import / Export, an
            item edit, or a direct inventory update), this page will refresh.
            The <strong>Release</strong> button activates as soon as every
            shortage is covered.
          </p>

          <ul className="mt-6 space-y-4">
            {Array.from(byLine.entries()).map(([lineId, group]) => (
              <li
                key={lineId}
                className="rounded-md border border-rule bg-canvas p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-semibold text-ink">
                    {group.lineName}
                    <span className="ml-2 text-xs font-normal uppercase tracking-wider text-ink-dim">
                      ({group.lineKind})
                    </span>
                  </div>
                </div>
                <ul className="mt-3 ml-6 space-y-1 border-l border-rule pl-3 text-sm">
                  {group.shortages.map((s) => {
                    const covered = s.item.quantity >= s.quantityShort;
                    return (
                      <li
                        key={s.id}
                        className={`flex items-baseline justify-between gap-3 ${
                          covered ? "text-green-200" : "text-yellow-100"
                        }`}
                      >
                        <span className="truncate">
                          {s.item.name}
                          {s.item.sku && (
                            <span className="ml-2 text-xs text-ink-dim">
                              {s.item.sku}
                            </span>
                          )}
                        </span>
                        <span className="tabular-nums whitespace-nowrap text-xs">
                          short {s.quantityShort} · in stock {s.item.quantity}
                          {covered ? " ✓" : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
