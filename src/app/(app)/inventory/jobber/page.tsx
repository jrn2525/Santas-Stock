import Link from "next/link";
import { WRITE_ROLES, requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { InventorySyncButton } from "@/components/inventory-sync-button";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function InventoryJobberPage() {
  await requireRole(WRITE_ROLES);

  const [connection, itemTotals, kitTotals, lastTouchedItem, lastTouchedKit] =
    await Promise.all([
      prisma.jobberConnection.findFirst(),
      prisma.item.aggregate({
        _count: { _all: true },
        where: {},
      }),
      prisma.kit.aggregate({ _count: { _all: true }, where: {} }),
      prisma.item.findFirst({
        where: { jobberProductId: { not: null } },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      prisma.kit.findFirst({
        where: { jobberProductId: { not: null } },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
    ]);
  const [linkedItems, linkedKits] = await Promise.all([
    prisma.item.count({ where: { jobberProductId: { not: null } } }),
    prisma.kit.count({ where: { jobberProductId: { not: null } } }),
  ]);

  const lastTouched =
    [lastTouchedItem?.updatedAt, lastTouchedKit?.updatedAt]
      .filter((d): d is Date => d instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">
          Jobber — Products &amp; Services
        </h1>
        <p className="mt-1 text-sm text-ink-dim">
          Pull your catalog from Jobber. Items map to Jobber Products; Kits map
          to Jobber Services. Jobber owns the name, description, and unit cost
          — everything else (quantity, location, status, vendor websites, kit
          recipes) is owned here and never overwritten.
        </p>
      </header>

      {!connection && (
        <section className="mt-8 rounded-lg border border-brand bg-brand/10 p-6">
          <h2 className="text-lg font-semibold text-ink">Not connected</h2>
          <p className="mt-1 text-sm text-ink">
            Connect Santa&apos;s Stock to your Jobber account before syncing
            inventory.
          </p>
          <Link
            href="/job-flow/jobber"
            className="mt-4 inline-block rounded-md bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-hover"
          >
            Go to Jobber connection
          </Link>
        </section>
      )}

      {connection && (
        <>
          <section className="mt-8 rounded-lg border border-rule bg-card p-6">
            <h2 className="text-lg font-semibold text-ink">Catalog status</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Pair
                label="Items linked to Jobber"
                value={`${linkedItems} / ${itemTotals._count._all}`}
              />
              <Pair
                label="Kits linked to Jobber"
                value={`${linkedKits} / ${kitTotals._count._all}`}
              />
              <Pair
                label="Last sync touched"
                value={lastTouched ? dateFormatter.format(lastTouched) : "—"}
              />
              <Pair label="Connection" value="✓ Active" />
            </dl>
          </section>

          <section className="mt-6 rounded-lg border border-rule bg-card p-6">
            <h2 className="text-lg font-semibold text-ink">Sync now</h2>
            <p className="mt-1 text-sm text-ink-dim">
              Pulls every Product and Service from your Jobber account. First
              run will claim your CSV-imported rows by exact name match; later
              runs match by stored Jobber ID so renames don&apos;t break
              anything. New Kits start with zero sub-items — you fill in the
              recipe here.
            </p>
            <div className="mt-4">
              <InventorySyncButton />
            </div>
          </section>
        </>
      )}

      <section className="mt-6 text-xs text-ink-dim">
        <p>
          Need to disconnect or reconnect?{" "}
          <Link
            href="/job-flow/jobber"
            className="underline hover:text-ink"
          >
            Manage the Jobber connection
          </Link>
          .
        </p>
      </section>
    </>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-dim">{label}</dt>
      <dd className="mt-1 text-ink">{value}</dd>
    </div>
  );
}
