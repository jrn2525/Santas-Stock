import { signOut } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
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

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/sign-in" });
}

const roleLabels: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  USER: "User",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const status = await getDbStatus();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold text-santa-red">Santa&apos;s Stock</h1>
          <p className="mt-1 text-sm text-gray-400">Inventory management for Christmas Decor.</p>
        </div>
        <div className="text-right text-sm">
          <div className="text-gray-300">{user.name}</div>
          <div className="text-gray-500">{roleLabels[user.role] ?? user.role}</div>
          <form action={signOutAction} className="mt-2">
            <button
              type="submit"
              className="rounded-md border border-gray-600 px-3 py-1 text-xs text-gray-300 hover:bg-gray-800"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

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
        <p>Pass 2 done. Next: items, categories, locations CRUD.</p>
      </section>
    </main>
  );
}
