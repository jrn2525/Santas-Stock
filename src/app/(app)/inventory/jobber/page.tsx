import { requireRole } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export default async function InventoryJobberPage() {
  await requireRole("ADMIN");

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">
          Jobber — Products &amp; Services
        </h1>
        <p className="mt-1 text-sm text-ink-dim">
          Sync products and services from Jobber into the inventory catalog.
        </p>
      </header>

      <section className="mt-8 rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Coming soon</h2>
        <p className="mt-2 text-sm text-ink-dim">
          After the initial CSV import of Items and Kits, all new Items and
          Kits will be pulled from Jobber here using the same OAuth connection
          configured under Job Flow → Jobber.
        </p>
      </section>
    </>
  );
}
