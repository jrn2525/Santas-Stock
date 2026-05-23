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
          Rows tagged <em>Product</em> become Items, rows tagged <em>Service</em>{" "}
          become Kits. For Kits, the <code>Item 1, Item 1 Qty, Item 2, …</code>{" "}
          columns set the kit&apos;s contents — Item names must match an existing
          Item exactly. Items are imported first so Kits can reference them.
          Jobber-only columns (Unit Price, Bookable, Duration Minutes, Quantity
          Enabled, Min/Max Quantity, Taxable) are ignored.
        </p>
        <div className="mt-4">
          <CsvImportForm />
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Export to CSV</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Downloads a CSV with the same five columns as Import, so files
          round-trip cleanly.
        </p>

        <form
          method="get"
          action="/api/inventory/export"
          className="mt-4 flex flex-wrap items-end gap-4"
        >
          <div>
            <label
              htmlFor="scope"
              className="block text-sm font-medium text-ink"
            >
              What to export
            </label>
            <select
              id="scope"
              name="scope"
              defaultValue="both"
              className="mt-1 block rounded-md border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="items">Items only</option>
              <option value="kits">Kits only</option>
              <option value="both">Both (single file)</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-hover"
          >
            Download CSV
          </button>
        </form>
      </section>
    </>
  );
}
