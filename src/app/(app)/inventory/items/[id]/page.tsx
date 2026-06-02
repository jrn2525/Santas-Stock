import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemStatus, ProductType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { to2Dp } from "@/lib/format";

export const dynamic = "force-dynamic";

const statusLabels: Record<ItemStatus, string> = {
  AVAILABLE: "Available",
  ALLOCATED: "Allocated",
};

const productTypeLabels: Record<ProductType, string> = {
  CHRISTMAS: "Christmas",
  LANDSCAPE: "Landscape",
  PERMANENT: "Permanent",
};

const decisionLabels: Record<string, string> = {
  GOOD: "Good",
  REPAIRED: "Repaired",
  DEAD: "Dead",
};

const decisionStyles: Record<string, string> = {
  GOOD: "border-green-600/40 bg-green-600/10 text-green-200",
  REPAIRED: "border-yellow-600/40 bg-yellow-500/10 text-yellow-200",
  DEAD: "border-red-600/40 bg-red-600/10 text-red-200",
};

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
  timeStyle: "short",
});

const dateOnlyFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
});

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const canWrite = user.role === "ADMIN" || user.role === "MANAGER";
  const { id } = await params;

  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      kitMemberships: {
        include: { kit: { select: { id: true, name: true } } },
        orderBy: { kit: { name: "asc" } },
      },
      jobLineShortages: {
        include: {
          jobLineItem: {
            include: {
              job: {
                select: {
                  id: true,
                  title: true,
                  jobNumber: true,
                  currentStage: true,
                  client: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
  if (!item) notFound();

  // Recent inspection decisions where this item was the target. Includes both:
  //   - line-level decisions on JobLineItems where item = this item
  //   - component-level decisions where the component item = this item
  const [lineDecisions, componentDecisions] = await Promise.all([
    prisma.inspectionLineDecision.findMany({
      where: { jobLineItem: { itemId: item.id } },
      orderBy: { decidedAt: "desc" },
      take: 20,
      include: {
        jobLineItem: {
          include: {
            job: {
              select: {
                id: true,
                title: true,
                jobNumber: true,
                client: { select: { name: true } },
              },
            },
          },
        },
        decidedBy: { select: { name: true } },
      },
    }),
    prisma.inspectionComponentDecision.findMany({
      where: { componentItemId: item.id },
      orderBy: { decidedAt: "desc" },
      take: 20,
      include: {
        jobLineItem: {
          include: {
            job: {
              select: {
                id: true,
                title: true,
                jobNumber: true,
                client: { select: { name: true } },
              },
            },
            kit: { select: { name: true } },
          },
        },
        decidedBy: { select: { name: true } },
      },
    }),
  ]);

  // Combine and sort. Each entry has a jobLineItem; component decisions
  // additionally carry the kit name so we can show context.
  type FeedEntry = {
    id: string;
    decidedAt: Date;
    decision: string;
    jobId: string;
    jobTitle: string | null;
    jobNumber: string | null;
    clientName: string;
    context: string;
    byName: string | null;
  };
  const feed: FeedEntry[] = [
    ...lineDecisions.map((d) => ({
      id: `line-${d.id}`,
      decidedAt: d.decidedAt,
      decision: d.decision,
      jobId: d.jobLineItem.job.id,
      jobTitle: d.jobLineItem.job.title,
      jobNumber: d.jobLineItem.job.jobNumber,
      clientName: d.jobLineItem.job.client?.name ?? "—",
      context: "Line item",
      byName: d.decidedBy?.name ?? null,
    })),
    ...componentDecisions.map((d) => ({
      id: `comp-${d.id}`,
      decidedAt: d.decidedAt,
      decision: d.decision,
      jobId: d.jobLineItem.job.id,
      jobTitle: d.jobLineItem.job.title,
      jobNumber: d.jobLineItem.job.jobNumber,
      clientName: d.jobLineItem.job.client?.name ?? "—",
      context: d.jobLineItem.kit?.name
        ? `Component of ${d.jobLineItem.kit.name}`
        : "Kit component",
      byName: d.decidedBy?.name ?? null,
    })),
  ]
    .sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime())
    .slice(0, 20);

  const totalShort = item.jobLineShortages.reduce(
    (sum, s) => sum + s.quantityShort,
    0,
  );
  const isLowStock = item.minQuantity > 0 && item.quantity <= item.minQuantity;

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-dim">
            <Link href="/inventory/items" className="hover:text-ink">
              ← Items
            </Link>
          </p>
          <h1 className="mt-2 text-3xl font-bold text-brand-hover">
            {item.name}
          </h1>
          <p className="mt-1 text-sm text-ink-dim">
            {item.sku && <>SKU {item.sku} · </>}
            {item.manufacturer ?? "—"}
            {item.model && <> · {item.model}</>}
          </p>
        </div>
        {canWrite && (
          <Link
            href={`/inventory/items/${item.id}/edit`}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-ink hover:bg-brand-hover"
          >
            Edit
          </Link>
        )}
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="On hand"
          value={to2Dp(item.quantity)}
          accent={isLowStock ? "yellow" : "default"}
        />
        <StatCard
          label="Min quantity"
          value={item.minQuantity > 0 ? to2Dp(item.minQuantity) : "—"}
          hint={
            item.minQuantity > 0
              ? "Low-stock alert at or below"
              : "No alert set"
          }
        />
        <StatCard
          label="Status"
          value={statusLabels[item.status]}
          accent={item.status === "ALLOCATED" ? "red" : "default"}
        />
        <StatCard
          label="Active"
          value={item.active ? "Yes" : "No"}
          accent={item.active ? "default" : "yellow"}
        />
      </section>

      {totalShort > 0 && (
        <section className="mt-4 rounded-md border border-yellow-700/40 bg-yellow-500/10 p-4 text-sm text-yellow-100">
          <strong className="font-semibold">Short by {to2Dp(totalShort)}.</strong>{" "}
          {item.jobLineShortages.length} active shortage
          {item.jobLineShortages.length === 1 ? "" : "s"} across jobs —
          see below.
        </section>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-rule bg-card p-6">
          <h2 className="text-lg font-semibold text-ink">Identity</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <DtDd label="SKU" value={item.sku} />
            <DtDd
              label="Product type"
              value={item.productType ? productTypeLabels[item.productType] : null}
            />
            <DtDd label="Manufacturer" value={item.manufacturer} />
            <DtDd label="Model" value={item.model} />
            <DtDd
              label="Unit cost"
              value={
                item.unitCost != null
                  ? moneyFmt.format(Number(item.unitCost))
                  : null
              }
            />
            <DtDd
              label="Purchase date"
              value={
                item.purchaseDate ? dateOnlyFmt.format(item.purchaseDate) : null
              }
            />
            <DtDd label="Home location" value={item.homeLocation} />
            <DtDd label="Current location" value={item.currentLocation} />
          </dl>
          {item.description && (
            <p className="mt-4 whitespace-pre-line text-sm text-ink-dim">
              {item.description}
            </p>
          )}
        </section>

        <section className="rounded-lg border border-rule bg-card p-6">
          <h2 className="text-lg font-semibold text-ink">Used in kits</h2>
          {item.kitMemberships.length === 0 ? (
            <p className="mt-3 text-sm text-ink-dim">
              Not a component of any kit recipe.
            </p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {item.kitMemberships.map((km) => (
                <li
                  key={km.kitId + km.itemId}
                  className="flex items-baseline justify-between gap-3 border-b border-rule/40 pb-1.5 last:border-b-0 last:pb-0"
                >
                  <Link
                    href={`/inventory/kits/${km.kit.id}/edit`}
                    className="truncate text-ink hover:text-brand"
                  >
                    {km.kit.name}
                  </Link>
                  <span className="text-xs tabular-nums text-ink-dim whitespace-nowrap">
                    ×{to2Dp(km.quantity)} per kit
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-rule bg-card p-6">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Active shortages</h2>
          <span className="text-xs text-ink-dim">
            {item.jobLineShortages.length} entry
            {item.jobLineShortages.length === 1 ? "" : "ies"}
          </span>
        </header>
        {item.jobLineShortages.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">
            No outstanding shortages for this item.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-rule/40">
            {item.jobLineShortages.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-baseline justify-between gap-3 py-2 text-sm"
              >
                <Link
                  href={`/job-flow/jobs/${s.jobLineItem.job.id}/awaiting-stock`}
                  className="min-w-0 truncate text-ink hover:text-brand"
                >
                  {s.jobLineItem.job.title ?? "(untitled)"}
                  <span className="ml-2 text-xs text-ink-dim">
                    {s.jobLineItem.job.jobNumber &&
                      `#${s.jobLineItem.job.jobNumber} · `}
                    {s.jobLineItem.job.client?.name ?? "—"}
                  </span>
                </Link>
                <span className="text-xs tabular-nums text-red-300 whitespace-nowrap">
                  Short ×{to2Dp(s.quantityShort)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-rule bg-card p-6">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">
            Recent inspection activity
          </h2>
          <span className="text-xs text-ink-dim">
            Last {feed.length} {feed.length === 1 ? "decision" : "decisions"}
          </span>
        </header>
        {feed.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">
            No inspection decisions have touched this item yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-rule/40">
            {feed.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-baseline justify-between gap-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/job-flow/jobs/${e.jobId}`}
                    className="font-medium text-ink hover:text-brand"
                  >
                    {e.jobTitle ?? "(untitled)"}
                  </Link>
                  <span className="ml-2 text-xs text-ink-dim">
                    {e.jobNumber && `#${e.jobNumber} · `}
                    {e.clientName}
                  </span>
                  <div className="mt-0.5 text-xs text-ink-dim">
                    {e.context}
                    {e.byName && ` · by ${e.byName}`}
                  </div>
                </div>
                <div className="flex items-baseline gap-3">
                  <span
                    className={`rounded border px-2 py-0.5 text-xs font-medium ${decisionStyles[e.decision]}`}
                  >
                    {decisionLabels[e.decision]}
                  </span>
                  <span className="text-xs text-ink-dim whitespace-nowrap">
                    {dateFmt.format(e.decidedAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {item.websites.length > 0 && (
        <section className="mt-6 rounded-lg border border-rule bg-card p-6">
          <h2 className="text-lg font-semibold text-ink">Vendor links</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {item.websites.map((w, i) => (
              <li key={i}>
                <a
                  href={w}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-brand hover:underline"
                >
                  {w}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "default" | "yellow" | "red";
}) {
  let cls =
    "rounded-lg border p-4 ";
  if (accent === "yellow") {
    cls += "border-yellow-700/40 bg-yellow-500/10";
  } else if (accent === "red") {
    cls += "border-brand/40 bg-brand/10";
  } else {
    cls += "border-rule bg-card";
  }
  return (
    <div className={cls}>
      <div className="text-xs uppercase tracking-wider text-ink-dim">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-ink tabular-nums">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-dim">{hint}</div>}
    </div>
  );
}

function DtDd({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <>
      <dt className="text-xs uppercase tracking-wider text-ink-dim">{label}</dt>
      <dd className="text-sm text-ink">{value ?? "—"}</dd>
    </>
  );
}
