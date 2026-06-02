import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { to2Dp } from "@/lib/format";
import { ResolveControls } from "@/components/replacement-resolve";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function ReplacementsPage() {
  const user = await requireUser();
  const canWrite = user.role === "ADMIN" || user.role === "MANAGER";

  const [pending, resolved, pendingAgg] = await Promise.all([
    prisma.replacementQueue.findMany({
      where: { resolution: null },
      orderBy: { flaggedAt: "asc" },
      include: {
        item: { select: { id: true, name: true, sku: true } },
        flaggedBy: { select: { name: true } },
      },
    }),
    prisma.replacementQueue.findMany({
      where: { resolution: { not: null } },
      orderBy: { resolvedAt: "desc" },
      take: 30,
      include: {
        item: { select: { id: true, name: true, sku: true } },
        flaggedBy: { select: { name: true } },
        resolvedBy: { select: { name: true } },
      },
    }),
    prisma.replacementQueue.aggregate({
      where: { resolution: null },
      _sum: { quantity: true },
      _count: { _all: true },
    }),
  ]);

  const pendingCount = pendingAgg._count._all ?? 0;
  const pendingUnits = pendingAgg._sum.quantity ?? 0;

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Replacements</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Items flagged for repair or replacement, automatically queued
          by inspection Dead and Repaired decisions. Triage each one as
          Repair (fix in-house), Replace from Stock (pull a replacement
          from the pool), or Purchase Order (order from a vendor).
        </p>
      </header>

      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Open entries"
          value={pendingCount.toString()}
          accent={pendingCount > 0 ? "yellow" : "default"}
        />
        <StatCard
          label="Units needed"
          value={to2Dp(pendingUnits)}
          accent={pendingUnits > 0 ? "yellow" : "default"}
        />
        <StatCard
          label="Resolved (last 30)"
          value={resolved.length.toString()}
        />
      </section>

      <section className="mt-8">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">Pending triage</h2>
          <span className="text-xs text-ink-dim">
            Oldest flagged first
          </span>
        </header>

        {pending.length === 0 ? (
          <p className="mt-4 rounded-md border border-rule bg-card p-6 text-center text-sm text-ink-dim">
            Nothing pending. Inspection Dead and Repaired decisions add
            entries here automatically.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {pending.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-rule bg-canvas p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/inventory/items/${r.item.id}`}
                      className="font-medium text-ink hover:text-brand"
                    >
                      {r.item.name}
                    </Link>
                    {r.item.sku && (
                      <span className="ml-2 text-xs text-ink-dim">
                        SKU {r.item.sku}
                      </span>
                    )}
                    <div className="mt-0.5 text-xs text-ink-dim">
                      {r.reason}
                      {r.flaggedBy?.name && <> · by {r.flaggedBy.name}</>}
                      <> · {dateFmt.format(r.flaggedAt)}</>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-red-300 tabular-nums whitespace-nowrap">
                    ×{to2Dp(r.quantity)}
                  </span>
                </div>
                {canWrite && (
                  <div className="mt-3">
                    <ResolveControls
                      id={r.id}
                      current={null}
                      poId={r.poId}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {resolved.length > 0 && (
        <section className="mt-8">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">
              Recently resolved
            </h2>
            <span className="text-xs text-ink-dim">
              Last {resolved.length}
            </span>
          </header>

          <ul className="mt-4 space-y-2">
            {resolved.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-rule bg-canvas p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/inventory/items/${r.item.id}`}
                      className="font-medium text-ink hover:text-brand"
                    >
                      {r.item.name}
                    </Link>
                    {r.item.sku && (
                      <span className="ml-2 text-xs text-ink-dim">
                        SKU {r.item.sku}
                      </span>
                    )}
                    <div className="mt-0.5 text-xs text-ink-dim">
                      {r.reason}
                      {r.resolvedBy?.name && (
                        <> · resolved by {r.resolvedBy.name}</>
                      )}
                      {r.resolvedAt && (
                        <> · {dateFmt.format(r.resolvedAt)}</>
                      )}
                    </div>
                  </div>
                  <span className="text-sm tabular-nums text-ink-dim whitespace-nowrap">
                    ×{to2Dp(r.quantity)}
                  </span>
                </div>
                {canWrite && (
                  <div className="mt-3">
                    <ResolveControls
                      id={r.id}
                      current={r.resolution}
                      poId={r.poId}
                    />
                  </div>
                )}
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
  accent = "default",
}: {
  label: string;
  value: string;
  accent?: "default" | "yellow";
}) {
  let cls = "rounded-lg border p-4 ";
  if (accent === "yellow") {
    cls += "border-yellow-700/40 bg-yellow-500/10";
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
    </div>
  );
}
