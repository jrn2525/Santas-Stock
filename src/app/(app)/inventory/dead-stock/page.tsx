import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { to2Dp } from "@/lib/format";
import { PrintButton } from "@/components/print-button";

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

function parseDateParam(raw: string | undefined): Date | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function DeadStockPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; range?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;

  const now = new Date();
  const thisYearStart = new Date(now.getFullYear(), 0, 1);
  const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
  const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);

  // range=all overrides explicit from/to and means "unfiltered"
  const allTime = sp.range === "all";

  // Defaults: this calendar year (Jan 1 -> today, inclusive)
  let fromDate = allTime ? null : parseDateParam(sp.from);
  let toDate = allTime ? null : parseDateParam(sp.to);
  if (!allTime && !fromDate && !toDate) {
    fromDate = thisYearStart;
    toDate = now;
  }
  // Push `to` to end-of-day so a date like 2026-12-31 includes that whole day
  const toDateInclusive = toDate
    ? new Date(
        toDate.getFullYear(),
        toDate.getMonth(),
        toDate.getDate(),
        23,
        59,
        59,
        999,
      )
    : null;

  const decidedAtFilter =
    fromDate || toDateInclusive
      ? {
          decidedAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDateInclusive ? { lte: toDateInclusive } : {}),
          },
        }
      : {};

  // Pull every DEAD decision, both line-level (item lines) and component-
  // level (kit components). For each, compute the dead quantity from the
  // job line's quantity multiplied by the recipe quantity (for kits) or
  // just the line quantity (for item lines). Aggregate by itemId.
  const [lineDeaths, componentDeaths] = await Promise.all([
    prisma.inspectionLineDecision.findMany({
      where: { decision: "DEAD", ...decidedAtFilter },
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
      where: { decision: "DEAD", ...decidedAtFilter },
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

  // Range label for the header / printout
  let rangeLabel: string;
  if (allTime) {
    rangeLabel = "All time";
  } else if (fromDate && toDate) {
    rangeLabel = `${dateFmt.format(fromDate)} – ${dateFmt.format(toDate)}`;
  } else if (fromDate) {
    rangeLabel = `${dateFmt.format(fromDate)} onward`;
  } else if (toDate) {
    rangeLabel = `Through ${dateFmt.format(toDate)}`;
  } else {
    rangeLabel = "All time";
  }

  const fromInput = fromDate ? toIsoDate(fromDate) : "";
  const toInput = toDate ? toIsoDate(toDate) : "";

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-brand-hover">Dead Stock</h1>
          <p className="mt-1 text-sm text-ink-dim no-print">
            Items lost to inspection Dead decisions. Filter by date range
            for a tax-year snapshot, then Print Report for accounting.
          </p>
          <p className="mt-1 hidden text-sm print:block">
            Dead Stock Report · {rangeLabel}
          </p>
        </div>
        <div className="no-print">
          <PrintButton />
        </div>
      </header>

      <form
        className="mt-6 flex flex-wrap items-end gap-3 no-print"
        action="/inventory/dead-stock"
      >
        <div>
          <label
            htmlFor="from"
            className="block text-xs font-medium text-ink-dim"
          >
            From
          </label>
          <input
            id="from"
            type="date"
            name="from"
            defaultValue={fromInput}
            className="mt-1 rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label
            htmlFor="to"
            className="block text-xs font-medium text-ink-dim"
          >
            To
          </label>
          <input
            id="to"
            type="date"
            name="to"
            defaultValue={toInput}
            className="mt-1 rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-brand bg-canvas px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand hover:text-ink"
        >
          Apply
        </button>
        <div className="flex flex-wrap gap-2">
          <PresetLink
            href={`/inventory/dead-stock?from=${toIsoDate(thisYearStart)}&to=${toIsoDate(now)}`}
            label="This year"
          />
          <PresetLink
            href={`/inventory/dead-stock?from=${toIsoDate(lastYearStart)}&to=${toIsoDate(lastYearEnd)}`}
            label="Last year"
          />
          <PresetLink
            href={`/inventory/dead-stock?range=all`}
            label="All time"
          />
        </div>
      </form>

      <p className="mt-3 text-xs text-ink-dim no-print">
        Currently showing: <strong className="text-ink">{rangeLabel}</strong>
      </p>

      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Units lost" value={to2Dp(totalDeadUnits)} />
        <StatCard
          label="Item types affected"
          value={itemTypesAffected.toString()}
        />
        <StatCard
          label="Estimated loss"
          value={totalLoss > 0 ? moneyFmt.format(totalLoss) : "—"}
          hint={
            totalLoss > 0 ? undefined : "Set unit cost on items to compute"
          }
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
              <th className="px-4 py-3 text-right">Unit cost</th>
              <th className="px-4 py-3 text-right">Est. loss</th>
              <th className="px-4 py-3">Latest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule bg-canvas">
            {sortedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-ink-dim"
                >
                  No dead stock recorded in this date range.
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
                    {r.unitCost != null ? moneyFmt.format(r.unitCost) : "—"}
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
          {sortedRows.length > 0 && (
            <tfoot className="bg-card text-sm font-semibold text-ink">
              <tr>
                <td className="px-4 py-3" colSpan={2}>
                  Total
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {to2Dp(totalDeadUnits)}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right tabular-nums">
                  {totalLoss > 0 ? moneyFmt.format(totalLoss) : "—"}
                </td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {sortedRows.length > 0 && (
        <p className="mt-3 text-xs text-ink-dim no-print">
          Showing {sortedRows.length}{" "}
          {sortedRows.length === 1 ? "item" : "items"}. Sorted by units
          lost.
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

function PresetLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-md border border-rule bg-canvas px-3 py-2 text-xs font-medium text-ink hover:border-brand"
    >
      {label}
    </Link>
  );
}
