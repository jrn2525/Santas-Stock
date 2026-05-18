import { requireRole } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export default async function ImportExportPage() {
  await requireRole("ADMIN");

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Import / Export</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Bulk import Items and Kits from CSV. Export the current catalog for
          backup or off-system editing.
        </p>
      </header>

      <section className="mt-8 rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Coming soon</h2>
        <p className="mt-2 text-sm text-ink-dim">
          CSV upload for Items and Kits (initial seed), download buttons for
          current Items / Kits exports. Once seeded, new records flow in from
          Jobber via the Inventory → Jobber sync.
        </p>
      </section>
    </>
  );
}
