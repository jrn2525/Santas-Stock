import Link from "next/link";
import type { JobStage, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { STAGE_LABELS } from "@/lib/job-flow";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const STAGE_OPTIONS: JobStage[] = [
  "NEW",
  "ALLOCATED",
  "BUILT",
  "STAGED",
  "INSTALLED",
  "INSPECTION",
  "COMPLETE",
  "DEACTIVATED",
];

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

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; customers?: string }>;
}) {
  await requireUser();
  const { q, stage, customers } = await searchParams;
  const query = q?.trim() ?? "";
  const stageFilter =
    stage && STAGE_OPTIONS.includes(stage as JobStage)
      ? (stage as JobStage)
      : null;
  // customers filter: "active" (default), "inactive", or "all"
  const customerFilter =
    customers === "inactive" || customers === "all" ? customers : "active";

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
  if (stageFilter) {
    andClauses.push({ currentStage: stageFilter });
  }
  if (customerFilter === "active") {
    andClauses.push({ client: { is: { active: true } } });
  } else if (customerFilter === "inactive") {
    andClauses.push({ client: { is: { active: false } } });
  }
  // "all" applies no client filter
  const where: Prisma.JobberJobWhereInput =
    andClauses.length > 0 ? { AND: andClauses } : {};

  const jobs = await prisma.jobberJob.findMany({
    where,
    orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
    include: {
      client: { select: { id: true, name: true, active: true } },
      property: { select: { address: true } },
    },
    take: 500,
  });

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Jobs</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Jobs synced from Jobber. Click Sync Jobs in Job Flow → Jobber to
          refresh.
        </p>
      </header>

      <form
        className="mt-6 flex flex-wrap items-end gap-3"
        action="/job-flow/jobs"
      >
        <div className="min-w-[18rem] flex-1">
          <label
            htmlFor="job-search"
            className="block text-xs font-medium text-ink-dim"
          >
            Search
          </label>
          <input
            id="job-search"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Title, job #, client name..."
            className="mt-1 block w-full rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label
            htmlFor="stage-filter"
            className="block text-xs font-medium text-ink-dim"
          >
            Stage
          </label>
          <select
            id="stage-filter"
            name="stage"
            defaultValue={stageFilter ?? ""}
            className="mt-1 rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="">All stages</option>
            {STAGE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="customer-filter"
            className="block text-xs font-medium text-ink-dim"
          >
            Customers
          </label>
          <select
            id="customer-filter"
            name="customers"
            defaultValue={customerFilter}
            className="mt-1 rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="active">Active customers only</option>
            <option value="inactive">Deactivated customers only</option>
            <option value="all">All customers</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-brand bg-canvas px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand hover:text-ink"
        >
          Apply
        </button>
        {(query || stageFilter || customerFilter !== "active") && (
          <Link
            href="/job-flow/jobs"
            className="rounded-md border border-rule bg-canvas px-4 py-2 text-sm font-medium text-ink hover:border-brand"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="mt-4 overflow-hidden rounded-lg border border-rule">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="px-4 py-3">Job #</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Property</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Scheduled</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule bg-canvas">
            {jobs.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-ink-dim"
                >
                  {query || stageFilter ? (
                    <>No jobs match the current filters.</>
                  ) : (
                    <>No jobs yet. Run Sync Jobs in Job Flow → Jobber.</>
                  )}
                </td>
              </tr>
            ) : (
              jobs.map((j) => (
                <tr key={j.id} className="text-ink hover:bg-card/40">
                  <td className="px-4 py-3 text-ink-dim">
                    <Link href={`/job-flow/jobs/${j.id}`}>
                      {j.jobNumber ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/job-flow/jobs/${j.id}`}
                      className="hover:text-brand"
                    >
                      {j.title ?? "(untitled)"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {j.client ? (
                      <Link
                        href={`/job-flow/clients/${j.client.id}`}
                        className="hover:text-brand"
                      >
                        {j.client.name}
                      </Link>
                    ) : (
                      "—"
                    )}
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
                    {j.property?.address ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-dim">
                    {j.status || "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-dim">
                    {j.startAt ? dateFmt.format(j.startAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {j.total ? moneyFmt.format(Number(j.total)) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {jobs.length > 0 && (
        <p className="mt-3 text-xs text-ink-dim">
          Showing {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
          {jobs.length === 500 && " (capped at 500 — narrow the search)"}.
        </p>
      )}
    </>
  );
}
