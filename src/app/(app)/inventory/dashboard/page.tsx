import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { addDaysET, startOfDayET, todayET } from "@/lib/datetime";
import { to2Dp } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InventoryDashboardPage() {
  await requireUser();

  const today = todayET();
  const todayStart = startOfDayET(today);
  const weekEnd = addDaysET(todayStart, 7);

  const [items, available, allocated, totalQtyAgg, allActive, weekVisits] =
    await Promise.all([
      prisma.item.count({ where: { active: true } }),
      prisma.item.count({ where: { active: true, status: "AVAILABLE" } }),
      prisma.item.count({ where: { active: true, status: "ALLOCATED" } }),
      prisma.item.aggregate({
        _sum: { quantity: true },
        where: { active: true },
      }),
      prisma.item.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          quantity: true,
          minQuantity: true,
        },
      }),
      prisma.jobberVisit.findMany({
        where: { startAt: { gte: todayStart, lt: weekEnd } },
        select: { jobId: true },
      }),
    ]);

  const totalQty = totalQtyAgg._sum.quantity ?? 0;

  // Low stock — items where quantity is at or below their threshold (and the
  // threshold has been set to something meaningful).
  const lowStock = allActive
    .filter((i) => i.minQuantity > 0 && i.quantity <= i.minQuantity)
    .sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name));

  // Materials demand for upcoming week (same logic as Job Flow dashboard,
  // duplicated here intentionally — small and Server-Component friendly).
  const upcomingJobIds = Array.from(new Set(weekVisits.map((v) => v.jobId)));
  const upcomingJobs = upcomingJobIds.length
    ? await prisma.jobberJob.findMany({
        where: { id: { in: upcomingJobIds } },
        select: {
          lineItems: {
            select: {
              quantity: true,
              item: { select: { id: true, name: true, quantity: true } },
              kit: {
                select: {
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
            needed: (ex?.needed ?? 0) + ki.quantity * qty,
            have: ki.item.quantity,
          });
        }
      }
    }
  }
  const shortages = Array.from(demandMap.values())
    .filter((d) => d.needed > d.have)
    .sort((a, b) => b.needed - b.have - (a.needed - a.have));

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-dim">
          What you have, what&apos;s low, and what upcoming jobs need.
        </p>
      </header>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Items" value={items} href="/inventory/items" />
        <Stat label="Total stock qty" value={to2Dp(totalQty)} href="/inventory/items" />
        <Stat label="Available items" value={available} />
        <Stat label="Allocated items" value={allocated} />
      </section>

      {/* Low stock */}
      <section className="mt-6 rounded-lg border border-rule bg-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">Low stock</h2>
          <span className="text-xs text-ink-dim">
            Items at or below their minimum quantity
          </span>
        </div>

        {lowStock.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">
            Nothing low. Set a minimum quantity on each Item to enable this alert.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-rule text-sm">
            {lowStock.map((i) => (
              <li
                key={i.id}
                className="flex items-baseline justify-between gap-2 py-1.5"
              >
                <Link
                  href={`/inventory/items/${i.id}`}
                  className="text-ink hover:text-brand truncate"
                >
                  {i.name}
                </Link>
                <div className="text-xs tabular-nums text-ink-dim">
                  <span className={i.quantity === 0 ? "text-brand font-semibold" : "text-ink"}>
                    {to2Dp(i.quantity)}
                  </span>
                  <span className="opacity-70"> / min {i.minQuantity}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Short for this week */}
      <section className="mt-6 rounded-lg border border-rule bg-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">Short for this week</h2>
          <span className="text-xs text-ink-dim">
            Items where upcoming jobs need more than is in stock
          </span>
        </div>

        {shortages.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">
            No shortages for the next 7 days. (Or no upcoming jobs with line items.)
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-rule text-sm">
            {shortages.map((d) => (
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
                <div className="text-xs tabular-nums text-ink">
                  Need <strong>{to2Dp(d.needed)}</strong>, have {to2Dp(d.have)},{" "}
                  <strong className="text-brand">short {to2Dp(d.needed - d.have)}</strong>
                </div>
              </li>
            ))}
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
  value: number | string;
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
