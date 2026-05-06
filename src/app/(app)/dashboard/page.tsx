import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getCounts() {
  const [items, categories, locations, retired] = await Promise.all([
    prisma.item.count(),
    prisma.category.count(),
    prisma.location.count(),
    prisma.item.count({ where: { status: "RETIRED" } }),
  ]);
  return { items, categories, locations, retired };
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
    <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-6 transition hover:border-gray-600">
      <div className="text-sm text-gray-400">{label}</div>
      <div className="mt-2 text-3xl font-bold text-white">{value}</div>
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
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-400">
          Operational overview of your inventory.
        </p>
      </header>

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Items" value={counts.items} href="/items" />
        <StatCard label="Categories" value={counts.categories} href="/categories" />
        <StatCard label="Locations" value={counts.locations} href="/locations" />
        <StatCard label="Retired items" value={counts.retired} />
      </section>

      <section className="mt-10 rounded-lg border border-gray-700 bg-gray-900/50 p-6">
        <h2 className="text-lg font-semibold">Database connection</h2>
        {status.ok ? (
          <p className="mt-2 text-sm text-santa-green">
            ✓ Connected. Postgres time: <code>{status.now}</code>
          </p>
        ) : (
          <p className="mt-2 text-sm text-red-400">
            ✗ Failed: <code>{status.error}</code>
          </p>
        )}
      </section>
    </>
  );
}
