import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { getSettings } from "@/lib/settings";
import {
  addDaysET,
  startOfDayET,
  todayET,
  weekdayDateFormatET,
} from "@/lib/datetime";
import { Pagination, parsePageParam } from "@/components/pagination";

export const dynamic = "force-dynamic";

const dateFmt = weekdayDateFormatET;

export default async function PickListIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; range?: string; page?: string }>;
}) {
  await requireUser();
  const { defaultPageSize: PAGE_SIZE, pickListDefaultWindow } =
    await getSettings();
  const { q, range, page: pageParam } = await searchParams;
  const query = q?.trim() ?? "";
  // Date window: "week" (next 7 days) / "month" / "all". Falls back to the
  // admin-configured default when no explicit range is in the URL.
  const dateRange =
    range === "week" || range === "month" || range === "all"
      ? range
      : pickListDefaultWindow;
  const page = parsePageParam(pageParam);

  // Use Eastern-Time day boundaries (same as the dashboard) so the window
  // doesn't shift by the UTC offset on the Railway host.
  const todayStart = startOfDayET(todayET());
  const weekEnd = addDaysET(todayStart, 7);
  const monthEnd = addDaysET(todayStart, 30);

  const andClauses: Prisma.JobberJobWhereInput[] = [];
  if (query) {
    andClauses.push({
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { jobNumber: { contains: query, mode: "insensitive" } },
        {
          client: {
            is: { name: { contains: query, mode: "insensitive" } },
          },
        },
      ],
    });
  }
  // Default behaviour: only show jobs from active customers — pick
  // lists for deactivated customers are noise on this view.
  andClauses.push({ client: { is: { active: true } } });

  if (dateRange === "week") {
    andClauses.push({
      startAt: { gte: todayStart, lt: weekEnd },
    });
  } else if (dateRange === "month") {
    andClauses.push({
      startAt: { gte: todayStart, lt: monthEnd },
    });
  }
  // "all": no date filter

  const where: Prisma.JobberJobWhereInput =
    andClauses.length > 0 ? { AND: andClauses } : {};

  // Default sort: upcoming soonest first. For "all" mode, fall back to
  // newest-first so the user sees the latest jobs at the top.
  const orderBy: Prisma.JobberJobOrderByWithRelationInput[] =
    dateRange === "all"
      ? [{ startAt: "desc" }, { createdAt: "desc" }]
      : [{ startAt: "asc" }];

  const total = await prisma.jobberJob.count({ where });
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, maxPage);
  const jobs = await prisma.jobberJob.findMany({
      where,
      orderBy,
      include: {
        client: { select: { name: true, phones: true } },
        property: { select: { address: true } },
      },
      take: PAGE_SIZE,
      skip: (safePage - 1) * PAGE_SIZE,
    });

  const rangeLabel =
    dateRange === "week"
      ? "Next 7 days"
      : dateRange === "month"
        ? "Next 30 days"
        : "All time";

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Pick List</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Jobs you&apos;ll need to pick for, ordered by the next
          scheduled visit. Click any row to open the printable pick
          list for that job.
        </p>
      </header>

      <form
        className="mt-6 flex flex-wrap items-end gap-3"
        action="/job-flow/pick-list"
      >
        <div className="min-w-[18rem] flex-1">
          <label
            htmlFor="pl-search"
            className="block text-xs font-medium text-ink-dim"
          >
            Search
          </label>
          <input
            id="pl-search"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Job title, number, or customer..."
            className="mt-1 block w-full rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label
            htmlFor="pl-range"
            className="block text-xs font-medium text-ink-dim"
          >
            Window
          </label>
          <select
            id="pl-range"
            name="range"
            defaultValue={dateRange}
            className="mt-1 rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="week">Next 7 days</option>
            <option value="month">Next 30 days</option>
            <option value="all">All time</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-brand bg-canvas px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand hover:text-ink"
        >
          Apply
        </button>
        {(query || dateRange !== pickListDefaultWindow) && (
          <Link
            href="/job-flow/pick-list"
            className="rounded-md border border-rule bg-canvas px-4 py-2 text-sm font-medium text-ink hover:border-brand"
          >
            Clear
          </Link>
        )}
      </form>

      <p className="mt-3 text-xs text-ink-dim">
        Window: <strong className="text-ink">{rangeLabel}</strong> ·
        Active customers only
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-rule">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Scheduled</th>
              <th className="px-4 py-3">Job #</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Property</th>
              <th className="px-4 py-3 text-right">Pick list</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule bg-canvas">
            {jobs.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-ink-dim"
                >
                  {query ? (
                    <>No jobs matched &ldquo;{query}&rdquo;.</>
                  ) : dateRange === "week" ? (
                    <>No jobs scheduled in the next 7 days.</>
                  ) : dateRange === "month" ? (
                    <>No jobs scheduled in the next 30 days.</>
                  ) : (
                    <>
                      No jobs yet.{" "}
                      <Link
                        href="/job-flow/jobber"
                        className="text-brand underline"
                      >
                        Run a Jobber sync
                      </Link>{" "}
                      to pull them in.
                    </>
                  )}
                </td>
              </tr>
            ) : (
              jobs.map((j) => (
                <tr key={j.id} className="text-ink hover:bg-card/40">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/job-flow/pick-list/${j.id}`}
                      className="hover:text-brand"
                    >
                      {j.client?.name ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-dim whitespace-nowrap">
                    {j.client?.phones?.[0] ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-dim whitespace-nowrap">
                    {j.startAt ? dateFmt.format(j.startAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-dim">
                    <Link href={`/job-flow/pick-list/${j.id}`}>
                      {j.jobNumber ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/job-flow/pick-list/${j.id}`}
                      className="hover:text-brand"
                    >
                      {j.title ?? "(untitled)"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-dim">
                    {j.property?.address ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/job-flow/pick-list/${j.id}`}
                      className="text-xs font-medium text-brand hover:text-brand-hover"
                    >
                      View / Print →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={safePage}
        total={total}
        pageSize={PAGE_SIZE}
        baseUrl="/job-flow/pick-list"
        preserved={Object.fromEntries(
          Object.entries({
            q: query,
            range: dateRange === pickListDefaultWindow ? "" : dateRange,
          }).filter(([, v]) => v !== ""),
        )}
      />
    </>
  );
}
