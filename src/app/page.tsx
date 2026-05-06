import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getDbStatus() {
  try {
    const result = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now`;
    return { ok: true, now: result[0]?.now?.toISOString() ?? "unknown" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function Home() {
  const status = await getDbStatus();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold text-santa-red">Santa&apos;s Stock</h1>
      <p className="mt-2 text-lg text-gray-300">
        Inventory management for Christmas Decor.
      </p>

      <section className="mt-10 rounded-lg border border-gray-700 bg-gray-900/50 p-6">
        <h2 className="text-xl font-semibold">Database connection</h2>
        {status.ok ? (
          <p className="mt-2 text-santa-green">
            ✓ Connected. Postgres time: <code>{status.now}</code>
          </p>
        ) : (
          <p className="mt-2 text-red-400">
            ✗ Failed: <code>{status.error}</code>
          </p>
        )}
      </section>

      <section className="mt-8 text-sm text-gray-400">
        <p>Phase 1 MVP scaffolding. Next: auth, items CRUD, Jobber OAuth.</p>
      </section>
    </main>
  );
}
