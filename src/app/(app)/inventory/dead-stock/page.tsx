import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { to2Dp } from "@/lib/format";

export const dynamic = "force-dynamic";

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFmt = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

type Row = {
  itemId: string;
  itemName: string;
  sku: string | null;
  unitCost: number | null;
  totalDead: number;
  decisionCount: number;
  latestAt: Date | null;
};

export default async function DeadStockPage() {
  await requireUser();

  // Pull every DEAD decision, both line-level (item lines) and component-
  // level (kit components). For each, compute the dead quantity from the
  // job line's quantity multiplied by the recipe quantity (for kits) or
  // just the line quantity (for item lines). Aggregate by itemId.
  const [lineDeaths, componentDeaths] = await Promise.all([
    prisma.inspectionLineDecision.findMany({
      where: { decision: "DEAD" },
      orderBy: { decidedAt: "desc" },
      include: {
        jobLineItem: {
          select: {
            quantity: true,
            item: {
              select: {
                id: true,
                name: true,
                sku: true,
                unitCost: true,
              },
            },
          },
        },
      },
    }),
    prisma.inspectionComponentDecision.findMany({
      where: { decision: "DEAD" },
      orderBy: { decidedAt: "desc" },
      include: {
        componentItem: {
          select: { id: true, name: true, sku: true, unitCost: true },
        },
        jobLineItem: {
          select: {
            quantity: true,
            kit: {
              select: {
                items: {
                  select: { itemId: true, quantity: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const rows = new Map<string, Row>();

  function addToRow(
    item: {
      id: string;
      name: string;
      sku: string | null;
      unitCost: { toString: () => string } | null;
    },
    deadQty: number,
    decidedAt: Date,
  ) {
    const existing = rows.get(item.id);
    if (existing) {
      existing.totalDead += deadQty;
      existing.decisionCount++;
      if (
        existing.latestAt === null ||
        decidedAt.getTime() > existing.latestAt.getTime()
      ) {
        existing.latestAt = decidedAt;
      }
    } else {
      rows.set(item.id, {
        itemId: item.id,
        itemName: item.name,
        sku: item.sku,
        unitCost: item.unitCost != null ? Number(item.unitCost) : null,
        totalDead: deadQty,
        decisionCount: 1,
        latestAt: decidedAt,
      });
    }
  }

  for (const d of lineDeaths) {
    const item = d.jobLineItem.item;
    if (!item) continue;
    const deadQty = Math.ceil(Number(d.jobLineItem.quantity));
    if (deadQty <= 0) continue;
    addToRow(item, deadQty, d.decidedAt);
  }

  for (const d of componentDeaths) {
    const item = d.componentItem;
    if (!item) continue;
    const recipe = d.jobLineItem.kit?.items.find(
      (ki) => ki.itemId === item.id,
    );
    if (!recipe) continue;
    const deadQty = Math.ceil(
      Number(recipe.quantity) * Number(d.jobLineItem.quantity),
    );
    if (deadQty <= 0) continue;
    addToRow(item, deadQty, d.decidedAt);
  }

  const sortedRows = Array.from(rows.values()).sort(
    (a, b) => b.totalDead - a.totalDead,
  );

  const totalDeadUnits = sortedRows.reduce((s, r) => s + r.totalDead, 0);
  const totalLoss = sortedRows.reduce(
    (s, r) => s + (r.unitCost ? r.totalDead * r.unitCost : 0),
    0,
  );
  const itemTypesAffected = sortedRows.length;

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Dead Stock</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Items lost to inspection Dead decisions across all jobs.
          Aggregated from the per-line and per-component decisions
          captured during job inspections.
        </p>
      </header>

      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Units lost" value={to2Dp(totalDeadUnits)} />
        <StatCard label="Item types affected" value={itemTypesAffected.toString()} />
        <StatCard
          label="Estimated loss"
          value={totalLoss > 0 ? moneyFmt.format(totalLoss) : "—"}
          hint={totalLoss > 0 ? undefined : "Set unit cost on items to compute"}
        />
      </section>

      <div className="mt-6 overflow-hidden rounded-lg border border-rule">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3 text-right">Units lost</th>
              <th className="px-4 py-3 text-right">Decisions</th>
              <th className="px-4 py-3 text-right">Est. loss</th>
              <th className="px-4 py-3">Latest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule bg-canvas">
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-ink-dim"
                >
                  No dead stock recorded yet. Once items are marked Dead
                  during inspection, they&apos;ll aggregate here.
                </td>
              </tr>
            ) : (
              sortedRows.map((r) => (
                <tr key={r.itemId} className="text-ink hover:bg-card/40">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/inventory/items/${r.itemId}`}
                      className="hover:text-brand"
                    >
                      {r.itemName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-dim">{r.sku ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-300">
                    {to2Dp(r.totalDead)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-dim">
                    {r.decisionCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.unitCost != null
                      ? moneyFmt.format(r.totalDead * r.unitCost)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-dim">
                    {r.latestAt ? dateFmt.format(r.latestAt) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {sortedRows.length > 0 && (
        <p className="mt-3 text-xs text-ink-dim">
          Showing {sortedRows.length}{" "}
          {sortedRows.length === 1 ? "item" : "items"}. Sorted by units lost.
        </p>
      )}
    </>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-rule bg-card p-4">
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
