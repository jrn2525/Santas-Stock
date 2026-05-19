import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const dayFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default async function CalendarPage() {
  await requireUser();

  // Show all visits from 30 days ago through the future, grouped by day.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const visits = await prisma.jobberVisit.findMany({
    where: { startAt: { gte: cutoff } },
    orderBy: [{ startAt: "asc" }],
    include: {
      job: {
        select: {
          jobNumber: true,
          title: true,
          client: { select: { name: true } },
          property: { select: { address: true } },
        },
      },
    },
    take: 1000,
  });

  // Group by ISO day.
  const groups = new Map<string, typeof visits>();
  for (const v of visits) {
    if (!v.startAt) continue;
    const key = isoDay(v.startAt);
    const list = groups.get(key) ?? [];
    list.push(v);
    groups.set(key, list);
  }
  const sortedKeys = Array.from(groups.keys()).sort();
  const today = isoDay(startOfDay(new Date()));

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Calendar</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Visits synced from Jobber, grouped by day. Showing the last 30 days
          plus everything scheduled in the future.
        </p>
      </header>

      {sortedKeys.length === 0 ? (
        <section className="mt-8 rounded-lg border border-rule bg-card p-6 text-center text-ink-dim">
          No visits in range. Run Sync Visits in Job Flow → Jobber.
        </section>
      ) : (
        <div className="mt-8 space-y-6">
          {sortedKeys.map((key) => {
            const dayVisits = groups.get(key)!;
            const sample = dayVisits[0].startAt!;
            const isToday = key === today;
            return (
              <section
                key={key}
                className={`rounded-lg border ${
                  isToday ? "border-brand" : "border-rule"
                } bg-card p-5`}
              >
                <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
                  {dayFmt.format(sample)}
                  {isToday && (
                    <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs text-ink">
                      Today
                    </span>
                  )}
                </h2>

                <ul className="mt-3 divide-y divide-rule">
                  {dayVisits.map((v) => (
                    <li
                      key={v.id}
                      className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6"
                    >
                      <div className="w-44 shrink-0 text-sm text-ink-dim">
                        {v.startAt ? timeFmt.format(v.startAt) : "—"}
                        {v.endAt && (
                          <>
                            {" – "}
                            {timeFmt.format(v.endAt)}
                          </>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-ink">
                          {v.title ?? v.job.title ?? "(untitled visit)"}
                        </div>
                        <div className="text-xs text-ink-dim">
                          {v.job.client?.name ?? "—"}
                          {v.job.jobNumber && ` · Job #${v.job.jobNumber}`}
                          {v.job.property?.address &&
                            ` · ${v.job.property.address}`}
                        </div>
                        {v.status && (
                          <div className="mt-1 text-xs text-ink-dim">
                            Status: {v.status}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
