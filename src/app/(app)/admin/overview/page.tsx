import { prisma } from "@/lib/prisma";
import { roleLabel } from "@/lib/auth-helpers";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

async function getStats() {
  const [total, active, byRole, recentLogins] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { active: true } }),
    prisma.user.groupBy({
      by: ["role"],
      _count: { _all: true },
      where: { active: true },
    }),
    prisma.user.findMany({
      where: { active: true, lastLoginAt: { not: null } },
      orderBy: { lastLoginAt: "desc" },
      take: 5,
      select: { id: true, name: true, email: true, role: true, lastLoginAt: true },
    }),
  ]);

  const roleCounts = new Map<Role, number>();
  for (const row of byRole) {
    roleCounts.set(row.role, row._count._all);
  }

  return {
    total,
    active,
    inactive: total - active,
    roleCounts,
    recentLogins,
  };
}

export default async function AdminOverviewPage() {
  const stats = await getStats();

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Overview</h1>
        <p className="mt-1 text-sm text-ink-dim">
          User counts and recent activity for the back-office.
        </p>
      </header>

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total users" value={stats.total} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Inactive" value={stats.inactive} />
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Active Admins"
          value={stats.roleCounts.get("ADMIN") ?? 0}
        />
        <StatCard
          label="Active Managers"
          value={stats.roleCounts.get("MANAGER") ?? 0}
        />
        <StatCard
          label="Active Crew"
          value={stats.roleCounts.get("USER") ?? 0}
        />
      </section>

      <section className="mt-10 rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Recent logins</h2>
        {stats.recentLogins.length === 0 ? (
          <p className="mt-2 text-sm text-ink-dim">No logins recorded yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-rule">
            {stats.recentLogins.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between py-3 text-sm"
              >
                <div>
                  <div className="text-ink">{u.name}</div>
                  <div className="text-xs text-ink-dim">
                    {u.email} · {roleLabel(u.role)}
                  </div>
                </div>
                <div className="text-xs text-ink-dim">
                  {u.lastLoginAt
                    ? dateFormatter.format(u.lastLoginAt)
                    : "—"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-rule bg-card p-6">
      <div className="text-sm text-ink-dim">{label}</div>
      <div className="mt-2 text-3xl font-bold text-ink">{value}</div>
    </div>
  );
}
