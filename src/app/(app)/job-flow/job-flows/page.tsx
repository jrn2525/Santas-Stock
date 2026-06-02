import Link from "next/link";
import type { JobStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { FLOW_STAGES, STAGE_LABELS, TERMINAL_STAGES } from "@/lib/job-flow";

export const dynamic = "force-dynamic";

const ALL_STAGES: JobStage[] = ["NEW", ...FLOW_STAGES, ...TERMINAL_STAGES];

const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function JobFlowOverviewPage() {
  await requireUser();

  const [byStage, onHoldCount, onHoldJobs, recentEvents] = await Promise.all([
    prisma.jobberJob.groupBy({
      by: ["currentStage"],
      _count: { _all: true },
    }),
    prisma.jobberJob.count({ where: { isOnHold: true } }),
    prisma.jobberJob.findMany({
      where: { isOnHold: true },
      orderBy: { startAt: "asc" },
      take: 25,
      select: {
        id: true,
        title: true,
        jobNumber: true,
        client: { select: { name: true } },
        startAt: true,
      },
    }),
    prisma.jobStageEvent.findMany({
      orderBy: { at: "desc" },
      take: 30,
      include: {
        job: {
          select: {
            id: true,
            title: true,
            jobNumber: true,
            client: { select: { name: true } },
          },
        },
        byUser: { select: { name: true } },
      },
    }),
  ]);

  const stageCounts = new Map<JobStage, number>();
  for (const row of byStage) {
    stageCounts.set(row.currentStage, row._count._all);
  }
  const totalJobs = byStage.reduce((sum, r) => sum + r._count._all, 0);

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Job Flow</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Pipeline snapshot — where every job is right now, what&apos;s stuck,
          and recent stage transitions.
        </p>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {ALL_STAGES.map((stage) => {
          const count = stageCounts.get(stage) ?? 0;
          const isTerminal = TERMINAL_STAGES.includes(stage);
          return (
            <div
              key={stage}
              className={`rounded-lg border p-4 ${
                count > 0
                  ? isTerminal
                    ? "border-rule bg-card"
                    : "border-brand/40 bg-brand/10"
                  : "border-rule bg-card opacity-60"
              }`}
            >
              <div className="text-xs uppercase tracking-wider text-ink-dim">
                {STAGE_LABELS[stage]}
              </div>
              <div className="mt-1 text-2xl font-bold text-ink tabular-nums">
                {count}
              </div>
            </div>
          );
        })}
      </section>

      <p className="mt-2 text-xs text-ink-dim">
        {totalJobs} total job{totalJobs === 1 ? "" : "s"} in the system.
      </p>

      <section className="mt-10 rounded-lg border border-yellow-700/40 bg-yellow-500/5 p-6">
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-yellow-100">
            Awaiting Stock
          </h2>
          <span className="text-sm font-medium text-yellow-200 tabular-nums">
            {onHoldCount} job{onHoldCount === 1 ? "" : "s"}
          </span>
        </header>
        <p className="mt-1 text-sm text-yellow-100/70">
          Jobs that are blocked waiting on inventory to come in.
        </p>

        {onHoldJobs.length === 0 ? (
          <p className="mt-4 text-sm text-yellow-100/60">
            Nothing on hold. All jobs have what they need.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {onHoldJobs.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/job-flow/jobs/${j.id}/awaiting-stock`}
                  className="flex items-baseline justify-between gap-3 rounded-md border border-yellow-700/30 bg-canvas px-3 py-2 text-sm hover:border-yellow-500"
                >
                  <span className="min-w-0 truncate text-ink">
                    {j.title ?? "(untitled)"}{" "}
                    <span className="text-xs text-ink-dim">
                      {j.jobNumber && `#${j.jobNumber} · `}
                      {j.client?.name ?? "—"}
                    </span>
                  </span>
                  <span className="text-xs text-yellow-200">
                    View shortages →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 rounded-lg border border-rule bg-card p-6">
        <header>
          <h2 className="text-lg font-semibold text-ink">Recent activity</h2>
          <p className="mt-1 text-sm text-ink-dim">
            The last {recentEvents.length} stage transitions across all jobs.
          </p>
        </header>

        {recentEvents.length === 0 ? (
          <p className="mt-4 text-sm text-ink-dim">
            No stage transitions yet. Move a job through its flow to populate
            this feed.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-rule">
            {recentEvents.map((e) => (
              <li
                key={e.id}
                className="flex items-baseline justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <Link
                    href={`/job-flow/jobs/${e.job.id}`}
                    className="font-medium text-ink hover:text-brand"
                  >
                    {e.job.title ?? "(untitled)"}
                  </Link>
                  <span className="ml-2 text-xs text-ink-dim">
                    {e.job.jobNumber && `#${e.job.jobNumber} · `}
                    {e.job.client?.name ?? "—"}
                  </span>
                  <div className="mt-0.5 text-xs text-ink-dim">
                    {e.fromStage
                      ? `${STAGE_LABELS[e.fromStage]} → ${STAGE_LABELS[e.toStage]}`
                      : `Started at ${STAGE_LABELS[e.toStage]}`}
                    {e.byUser?.name && ` · by ${e.byUser.name}`}
                  </div>
                </div>
                <span className="text-xs text-ink-dim whitespace-nowrap">
                  {dateFmt.format(e.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
