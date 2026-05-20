import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { JobberJobsSyncButton } from "@/components/jobber-job-flow-sync-buttons";
import { to2Dp } from "@/lib/format";
import {
  addDaysET,
  fmtShortDateET,
  fmtTimeET,
  formatDateParam,
  getETParts,
  isAllDayVisit,
  isSameETDay,
  startOfDayET,
  todayET,
} from "@/lib/datetime";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function JobFlowDashboardPage() {
  await requireUser();

  const now = new Date();
  const today = todayET();
  const todayStart = startOfDayET(today);
  const tomorrowStart = addDaysET(todayStart, 1);
  const weekEnd = addDaysET(todayStart, 7);
  const recentNotesSince = addDaysET(todayStart, -7);

  // Visit data
  const [todayVisits, weekVisits, recentNotes, lastVisitSync] =
    await Promise.all([
      prisma.jobberVisit.findMany({
        where: { startAt: { gte: todayStart, lt: tomorrowStart } },
        orderBy: { startAt: "asc" },
        include: {
          job: {
            select: {
              id: true,
              title: true,
              jobNumber: true,
              status: true,
              client: { select: { name: true } },
              property: { select: { address: true } },
            },
          },
        },
      }),
      prisma.jobberVisit.findMany({
        where: { startAt: { gte: todayStart, lt: weekEnd } },
        select: { id: true, startAt: true, jobId: true },
        orderBy: { startAt: "asc" },
      }),
      prisma.jobberNote.findMany({
        where: { noteCreatedAt: { gte: recentNotesSince } },
        orderBy: { noteCreatedAt: "desc" },
        take: 20,
        include: {
          client: { select: { id: true, name: true } },
          job: { select: { id: true, title: true, jobNumber: true } },
          visit: {
            select: {
              jobId: true,
              job: { select: { id: true, title: true, jobNumber: true } },
            },
          },
        },
      }),
      prisma.jobberVisit.findFirst({
        orderBy: { syncedAt: "desc" },
        select: { syncedAt: true },
      }),
    ]);

  // Aggregate materials demand from jobs with upcoming visits.
  const upcomingJobIds = Array.from(
    new Set(weekVisits.map((v) => v.jobId)),
  );

  const upcomingJobs = upcomingJobIds.length
    ? await prisma.jobberJob.findMany({
        where: { id: { in: upcomingJobIds } },
        select: {
          id: true,
          lineItems: {
            select: {
              quantity: true,
              item: { select: { id: true, name: true, quantity: true } },
              kit: {
                select: {
                  name: true,
                  quantity: true,
                  items: {
                    select: {
                      quantity: true,
                      item: { select: { id: true, name: true, quantity: true } },
                    },
                  },
                },
              },
            },
          },
        },
      })
    : [];

  type Demand = { itemId: string; name: string; needed: number; have: number };
  const demandMap = new Map<string, Demand>();
  for (const job of upcomingJobs) {
    for (const li of job.lineItems) {
      const qty = Number(li.quantity);
      if (li.item) {
        const ex = demandMap.get(li.item.id);
        demandMap.set(li.item.id, {
          itemId: li.item.id,
          name: li.item.name,
          needed: (ex?.needed ?? 0) + qty,
          have: li.item.quantity,
        });
      } else if (li.kit) {
        for (const ki of li.kit.items) {
          const ex = demandMap.get(ki.item.id);
          demandMap.set(ki.item.id, {
            itemId: ki.item.id,
            name: ki.item.name,
            needed: (ex?.needed ?? 0) + Number(ki.quantity) * qty,
            have: ki.item.quantity,
          });
        }
      }
    }
  }
  const demand = Array.from(demandMap.values()).sort((a, b) => b.needed - a.needed);
  const shortages = demand.filter((d) => d.needed > d.have);

  // Week strip — counts per day.
  const weekStrip = Array.from({ length: 7 }, (_, i) => {
    const d = addDaysET(todayStart, i);
    const next = addDaysET(d, 1);
    const count = weekVisits.filter(
      (v) => v.startAt && v.startAt >= d && v.startAt < next,
    ).length;
    return { date: d, count };
  });

  const recentNotesCount = recentNotes.length;
  const lastSyncLabel = lastVisitSync?.syncedAt
    ? relativeTime(lastVisitSync.syncedAt, now)
    : "Never";

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-dim">
          What&apos;s happening today, this week, and what you need to pull. Times in ET.
        </p>
      </header>

      {/* Stat strip */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Today's visits"
          value={todayVisits.length}
          href={`/job-flow/calendar?view=day&date=${formatDateParam(today)}`}
        />
        <Stat
          label="This week's visits"
          value={weekVisits.length}
          href={`/job-flow/calendar?view=week&date=${formatDateParam(today)}`}
        />
        <Stat
          label="Jobs this week"
          value={upcomingJobIds.length}
          href="/job-flow/jobs"
        />
        <Stat
          label="Recent notes (7d)"
          value={recentNotesCount}
        />
      </section>

      {/* Sync now */}
      <section className="mt-6 rounded-lg border border-rule bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">Data freshness</h2>
          <span className="text-xs text-ink-dim">
            Last sync: <span className="text-ink">{lastSyncLabel}</span>
          </span>
        </div>
        <div className="mt-3">
          <JobberJobsSyncButton />
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Today's schedule */}
        <Card title="Today">
          {todayVisits.length === 0 ? (
            <p className="text-sm text-ink-dim">No visits scheduled today.</p>
          ) : (
            <ul className="divide-y divide-rule">
              {todayVisits.map((v) => (
                <li key={v.id} className="py-2">
                  <Link
                    href={`/job-flow/jobs/${v.job.id}`}
                    className="block hover:bg-canvas/50 -mx-2 px-2 py-1 rounded"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="font-medium text-ink truncate">
                        {v.job.client?.name ?? v.title ?? "(visit)"}
                      </div>
                      <div className="shrink-0 text-xs tabular-nums text-ink-dim">
                        {v.startAt && isAllDayVisit(v.startAt, v.endAt)
                          ? "All day"
                          : v.startAt
                            ? fmtTimeET(v.startAt) +
                              (v.endAt ? ` – ${fmtTimeET(v.endAt)}` : "")
                            : ""}
                      </div>
                    </div>
                    <div className="text-xs text-ink-dim truncate">
                      {v.job.jobNumber && <>Job #{v.job.jobNumber} · </>}
                      {v.job.property?.address ?? v.job.title ?? ""}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Week strip */}
        <Card title="This week">
          <div className="grid grid-cols-7 gap-1">
            {weekStrip.map(({ date, count }) => {
              const isToday = isSameETDay(date, today);
              const max = Math.max(...weekStrip.map((s) => s.count), 1);
              const heightPct = (count / max) * 100;
              return (
                <Link
                  key={formatDateParam(date)}
                  href={`/job-flow/calendar?view=day&date=${formatDateParam(date)}`}
                  className={`flex flex-col items-center rounded p-1 hover:bg-canvas/50 ${
                    isToday ? "bg-brand/10" : ""
                  }`}
                >
                  <div className={`text-xs ${isToday ? "text-brand" : "text-ink-dim"}`}>
                    {DAY_NAMES[getETParts(date).weekday]}
                  </div>
                  <div className={`text-sm font-medium ${isToday ? "text-brand" : "text-ink"}`}>
                    {fmtShortDateET(date).split(" ")[1]}
                  </div>
                  <div className="mt-2 flex h-12 w-full items-end">
                    <div
                      className={`w-full rounded-t ${count > 0 ? "bg-brand/60" : "bg-rule"}`}
                      style={{ height: `${Math.max(heightPct, count > 0 ? 12 : 4)}%` }}
                    />
                  </div>
                  <div className={`mt-1 text-xs tabular-nums ${isToday ? "text-brand" : "text-ink"}`}>
                    {count}
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Materials & Shortages */}
      <section className="mt-6 rounded-lg border border-rule bg-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">
            Materials needed this week
          </h2>
          <span className="text-xs text-ink-dim">
            Across {upcomingJobIds.length} job{upcomingJobIds.length === 1 ? "" : "s"} with
            visits in the next 7 days
          </span>
        </div>

        {demand.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">
            No line items on upcoming jobs. (Either nothing scheduled, or jobs
            don&apos;t have synced line items yet.)
          </p>
        ) : (
          <>
            {shortages.length > 0 && (
              <div className="mt-4 rounded-md border border-brand bg-brand/10 p-3">
                <h3 className="text-sm font-semibold text-brand">
                  Short on {shortages.length} item{shortages.length === 1 ? "" : "s"}
                </h3>
                <ul className="mt-2 divide-y divide-brand/30 text-sm">
                  {shortages.map((d) => (
                    <li key={d.itemId} className="flex items-baseline justify-between gap-2 py-1">
                      <Link
                        href={`/inventory/items/${d.itemId}`}
                        className="text-ink hover:text-brand truncate"
                      >
                        {d.name}
                      </Link>
                      <div className="text-xs tabular-nums text-ink">
                        Need <strong>{d.needed}</strong>, have {d.have},{" "}
                        <strong className="text-brand">short {d.needed - d.have}</strong>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4">
              <h3 className="text-xs uppercase tracking-wider text-ink-dim">
                All materials
              </h3>
              <ul className="mt-2 divide-y divide-rule text-sm">
                {demand.slice(0, 40).map((d) => {
                  const short = d.needed > d.have;
                  return (
                    <li
                      key={d.itemId}
                      className="flex items-baseline justify-between gap-2 py-1.5"
                    >
                      <Link
                        href={`/inventory/items/${d.itemId}`}
                        className="text-ink hover:text-brand truncate"
                      >
                        {d.name}
                      </Link>
                      <div className={`text-xs tabular-nums ${short ? "text-brand" : "text-ink-dim"}`}>
                        ×{to2Dp(d.needed)} <span className="opacity-70">/ {to2Dp(d.have)} in stock</span>
                      </div>
                    </li>
                  );
                })}
                {demand.length > 40 && (
                  <li className="py-1 text-xs italic text-ink-dim">
                    …and {demand.length - 40} more.
                  </li>
                )}
              </ul>
            </div>
          </>
        )}
      </section>

      {/* Recent notes */}
      <section className="mt-6 rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Recent notes (last 7 days)</h2>
        {recentNotes.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">
            No notes created in the last week.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-rule">
            {recentNotes.map((n) => {
              const linkedJob = n.job ?? n.visit?.job ?? null;
              const parentLabel = linkedJob
                ? linkedJob.jobNumber
                  ? `Job #${linkedJob.jobNumber}`
                  : (linkedJob.title ?? "Job")
                : n.client?.name
                  ? `Customer: ${n.client.name}`
                  : "—";
              const body = n.body.length > 200 ? n.body.slice(0, 200) + "…" : n.body;
              const inner = (
                <div className="py-2">
                  <div className="flex items-baseline justify-between gap-2 text-xs text-ink-dim">
                    <span>{parentLabel}</span>
                    {n.noteCreatedAt && (
                      <span>{relativeTime(n.noteCreatedAt, now)}</span>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-ink">
                    {body}
                  </p>
                </div>
              );
              return (
                <li key={n.id}>
                  {linkedJob ? (
                    <Link
                      href={`/job-flow/jobs/${linkedJob.id}`}
                      className="block -mx-2 px-2 hover:bg-canvas/50 rounded"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="px-0">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const inner = (
    <div className="rounded-lg border border-rule bg-card p-4 transition hover:border-brand">
      <div className="text-xs uppercase tracking-wider text-ink-dim">{label}</div>
      <div className="mt-2 text-2xl font-bold text-ink tabular-nums">{value}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-rule bg-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function relativeTime(then: Date, now: Date): string {
  const diffMs = now.getTime() - then.getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return fmtShortDateET(then);
}
