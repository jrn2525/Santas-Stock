import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getCounts() {
  const [items, available, allocated, totalQty] = await Promise.all([
    prisma.item.count(),
    prisma.item.count({ where: { status: "AVAILABLE" } }),
    prisma.item.count({ where: { status: "ALLOCATED" } }),
    prisma.item.aggregate({ _sum: { quantity: true } }),
  ]);
  return {
    items,
    available,
    allocated,
    totalQty: totalQty._sum.quantity ?? 0,
  };
}

async function getDbStatus() {
  try {
    const result = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now`;
    return { ok: true, now: result[0]?.now?.toISOString() ?? "unknown" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const inner = (
    <div className="rounded-lg border border-rule bg-card p-6 transition hover:border-brand">
      <div className="text-sm text-ink-dim">{label}</div>
      <div className="mt-2 text-3xl font-bold text-ink">{value}</div>
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

export default async function DashboardPage() {
  const [counts, status] = await Promise.all([getCounts(), getDbStatus()]);

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Operational overview of your inventory.
        </p>
      </header>

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Items" value={counts.items} href="/items" />
        <StatCard label="Total stock qty" value={counts.totalQty} href="/items" />
        <StatCard label="Available items" value={counts.available} />
        <StatCard label="Allocated items" value={counts.allocated} />
      </section>

      <section className="mt-10 rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Database connection</h2>
        {status.ok ? (
          <p className="mt-2 text-sm text-ink">
            ✓ Connected. Postgres time: <code className="text-ink-dim">{status.now}</code>
          </p>
        ) : (
          <p className="mt-2 text-sm text-brand">
            ✗ Failed: <code>{status.error}</code>
          </p>
        )}
      </section>
    </>
  );
}
