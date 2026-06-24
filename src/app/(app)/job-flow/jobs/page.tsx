import Link from "next/link";
import type { JobStage, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { getSettings } from "@/lib/settings";
import { STAGE_LABELS } from "@/lib/job-flow";
import {
  BILLING_STATUS_LABELS,
  BILLING_STATUS_OPTIONS,
  billingStatusKey,
  billingStatusWhere,
  type BillingStatusKey,
} from "@/lib/billing-status";
import { dateFormatET } from "@/lib/datetime";
import { Pagination, parsePageParam } from "@/components/pagination";

export const dynamic = "force-dynamic";

const dateFmt = dateFormatET;

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

function billingBadgeStyle(key: BillingStatusKey): string {
  if (key === "paid") {
    return "border-green-600/40 bg-green-500/15 text-green-200";
  }
  if (key === "awaiting") {
    return "border-yellow-600/40 bg-yellow-500/15 text-yellow-200";
  }
  // upcoming
  return "border-rule bg-canvas text-ink-dim";
}

// Jobber visit statuses come through as raw enum-ish strings ("unscheduled",
// "active", "completed", ...). Show them title-cased to match the Jobber UI.
function humanizeVisitStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    stage?: string;
    customers?: string;
    billing?: string;
    scheduled?: string;
    page?: string;
  }>;
}) {
  await requireUser();
  const { defaultPageSize: PAGE_SIZE } = await getSettings();
  const { q, stage, customers, billing, scheduled, page: pageParam } =
    await searchParams;
  const query = q?.trim() ?? "";
  // Scheduled-date sort: "soonest" = closest date first (chronological asc),
  // "latest" = farthest date first (desc, the default — preserves prior order).
  const scheduledSort = scheduled === "soonest" ? "soonest" : "latest";
  const stageFilter =
    stage && STAGE_OPTIONS.includes(stage as JobStage)
      ? (stage as JobStage)
      : null;
  // customers filter: "active" (default), "inactive", or "all"
  const customerFilter =
    customers === "inactive" || customers === "all" ? customers : "active";
  const billingFilter =
    billing && BILLING_STATUS_OPTIONS.includes(billing as BillingStatusKey)
      ? (billing as BillingStatusKey)
      : null;
  const page = parsePageParam(pageParam);

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
  if (billingFilter) {
    andClauses.push(billingStatusWhere(billingFilter));
  }
  const where: Prisma.JobberJobWhereInput =
    andClauses.length > 0 ? { AND: andClauses } : {};

  const total = await prisma.jobberJob.count({ where });
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, maxPage);
  const orderBy: Prisma.JobberJobOrderByWithRelationInput[] =
    scheduledSort === "soonest"
      ? [{ startAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }]
      : [{ startAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];

  const jobs = await prisma.jobberJob.findMany({
      where,
      orderBy,
      include: {
        client: { select: { id: true, name: true, active: true } },
        // Most recent visit (scheduled visits win over unscheduled) for the
        // Visit Status column.
        visits: {
          orderBy: [
            { startAt: { sort: "desc", nulls: "last" } },
            { createdAt: "desc" },
          ],
          take: 1,
          select: { status: true },
        },
      },
      take: PAGE_SIZE,
      skip: (safePage - 1) * PAGE_SIZE,
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
            htmlFor="scheduled-sort"
            className="block text-xs font-medium text-ink-dim"
          >
            Scheduled
          </label>
          <select
            id="scheduled-sort"
            name="scheduled"
            defaultValue={scheduledSort}
            className="mt-1 rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="soonest">Closest date first</option>
            <option value="latest">Farthest date first</option>
          </select>
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
        <div>
          <label
            htmlFor="billing-filter"
            className="block text-xs font-medium text-ink-dim"
          >
            Billing Status
          </label>
          <select
            id="billing-filter"
            name="billing"
            defaultValue={billingFilter ?? ""}
            className="mt-1 rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="">All billing</option>
            {BILLING_STATUS_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {BILLING_STATUS_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-brand bg-canvas px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand hover:text-ink"
        >
          Apply
        </button>
        {(query ||
          stageFilter ||
          customerFilter !== "active" ||
          billingFilter ||
          scheduledSort !== "latest") && (
          <Link
            href="/job-flow/jobs"
            className="rounded-md border border-rule bg-canvas px-4 py-2 text-sm font-medium text-ink hover:border-brand"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="mt-4 overflow-x-auto rounded-lg border border-rule">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="px-4 py-3">Job #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Billing Status</th>
              <th className="px-4 py-3">Visit Status</th>
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
                  {query ||
                  stageFilter ||
                  billingFilter ||
                  customerFilter !== "active" ? (
                    <>No jobs match the current filters.</>
                  ) : (
                    <>No jobs yet. Run Sync Jobs in Job Flow → Jobber.</>
                  )}
                </td>
              </tr>
            ) : (
              jobs.map((j) => {
                const jobHref = `/job-flow/jobs/${j.id}`;
                return (
                  <tr key={j.id} className="text-ink hover:bg-card/40">
                    <td className="px-4 py-3 text-ink-dim">
                      <Link href={jobHref} className="block hover:text-brand">
                        {j.jobNumber ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={jobHref} className="block hover:text-brand">
                        {j.client?.name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <Link href={jobHref} className="block hover:text-brand">
                        {j.title ?? "(untitled)"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={jobHref} className="block">
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
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={jobHref} className="block">
                        {(() => {
                          const key = billingStatusKey(j.invoiceStatus);
                          return (
                            <span
                              className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${billingBadgeStyle(key)}`}
                            >
                              {BILLING_STATUS_LABELS[key]}
                            </span>
                          );
                        })()}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-dim">
                      <Link href={jobHref} className="block hover:text-brand">
                        {j.visits[0]?.status
                          ? humanizeVisitStatus(j.visits[0].status)
                          : "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-dim">
                      <Link href={jobHref} className="block hover:text-brand">
                        {j.startAt ? dateFmt.format(j.startAt) : "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <Link href={jobHref} className="block hover:text-brand">
                        {j.total ? moneyFmt.format(Number(j.total)) : "—"}
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={safePage}
        total={total}
        pageSize={PAGE_SIZE}
        baseUrl="/job-flow/jobs"
        preserved={Object.fromEntries(
          Object.entries({
            q: query,
            stage: stageFilter ?? "",
            customers: customerFilter === "active" ? "" : customerFilter,
            billing: billingFilter ?? "",
            scheduled: scheduledSort === "latest" ? "" : scheduledSort,
          }).filter(([, v]) => v !== ""),
        )}
      />
    </>
  );
}
