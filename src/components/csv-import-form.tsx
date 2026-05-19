"use client";

import { useActionState } from "react";
import {
  importInventoryCsv,
  emptyImportSummary,
  type ImportSummary,
} from "@/lib/actions/inventory-import";

export function CsvImportForm() {
  const [state, formAction, pending] = useActionState<ImportSummary, FormData>(
    importInventoryCsv,
    emptyImportSummary,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="file" className="block text-sm font-medium text-ink">
          CSV file
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          className="mt-1 block w-full rounded-md border border-rule bg-canvas px-3 py-2 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-brand file:px-3 file:py-1 file:text-sm file:font-medium file:text-ink hover:file:bg-brand-hover"
        />
        <p className="mt-2 text-xs text-ink-dim">
          Recognized columns: <code>Name</code>, <code>Description</code>,{" "}
          <code>Category</code>, <code>Unit Cost</code>, <code>Active</code>.
          Anything else is ignored. Category must be <em>Product</em> (→ Item)
          or <em>Service</em> (→ Kit). Existing rows are matched by name and
          updated.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-hover disabled:opacity-50"
      >
        {pending ? "Importing..." : "Import CSV"}
      </button>

      {state.message && (
        <div
          className={`rounded-md border p-3 text-sm ${
            state.ok
              ? "border-rule bg-card text-ink"
              : "border-brand/40 bg-card text-brand"
          }`}
        >
          <p className="font-medium">{state.message}</p>
          {state.ok && (
            <ul className="mt-2 space-y-0.5 text-xs text-ink-dim">
              <li>
                Items: {state.items.created} created, {state.items.updated}{" "}
                updated
              </li>
              <li>
                Kits: {state.kits.created} created, {state.kits.updated} updated
              </li>
              {state.skipped > 0 && <li>Skipped: {state.skipped}</li>}
            </ul>
          )}
          {state.errors.length > 0 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-ink-dim hover:text-ink">
                {state.errors.length} row
                {state.errors.length === 1 ? "" : "s"} skipped — show details
              </summary>
              <ul className="mt-2 max-h-48 space-y-1 overflow-auto rounded border border-rule bg-canvas p-2">
                {state.errors.map((e, i) => (
                  <li key={i} className="text-ink-dim">
                    <span className="text-ink">Row {e.row}:</span> {e.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </form>
  );
}
