import { requireRole } from "@/lib/auth-helpers";
import { CsvImportForm } from "@/components/csv-import-form";

export const dynamic = "force-dynamic";

export default async function ImportExportPage() {
  await requireRole("ADMIN");

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Import / Export</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Bulk-load the catalog from a CSV, or export it for backup and
          off-system editing.
        </p>
      </header>

      <section className="mt-8 rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Import from CSV</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Drop a Jobber Products &amp; Services export here. Rows tagged{" "}
          <em>Product</em> become Items, rows tagged <em>Service</em> become
          Kits. The Jobber-only columns (Unit Price, Bookable, Duration
          Minutes, Quantity Enabled, Min/Max Quantity, Taxable) are silently
          ignored.
        </p>
        <div className="mt-4">
          <CsvImportForm />
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Export to CSV</h2>
        <p className="mt-2 text-sm text-ink-dim">
          Coming next: download the catalog as a CSV, choosing Items, Kits, or
          Both.
        </p>
      </section>
    </>
  );
}
