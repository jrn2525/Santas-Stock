"use client";

import { useActionState } from "react";
import {
  syncJobberInventory,
  type InventorySyncFormState,
} from "@/lib/actions/jobber";

const empty: InventorySyncFormState = { errors: {}, message: null };

export function InventorySyncButton() {
  const [state, action, pending] = useActionState<InventorySyncFormState>(
    syncJobberInventory,
    empty,
  );

  return (
    <form action={action} className="space-y-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-ink hover:bg-brand-hover disabled:opacity-50"
      >
        {pending ? "Syncing from Jobber..." : "Sync now"}
      </button>

      {state.result && (
        <div className="space-y-1 text-xs text-ink-dim">
          <p>
            ✓ Items: {state.result.itemsCreated} created,{" "}
            {state.result.itemsUpdated} updated.
          </p>
          <p>
            ✓ Kits: {state.result.kitsCreated} created,{" "}
            {state.result.kitsUpdated} updated.
          </p>
          {state.result.skipped > 0 && (
            <p>Skipped {state.result.skipped} row(s).</p>
          )}
          {state.result.warnings.length > 0 && (
            <details className="mt-2 rounded border border-rule bg-canvas p-2">
              <summary className="cursor-pointer text-brand">
                {state.result.warnings.length} warning(s)
              </summary>
              <ul className="mt-2 space-y-1 text-ink-dim">
                {state.result.warnings.slice(0, 50).map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
                {state.result.warnings.length > 50 && (
                  <li className="italic">
                    …and {state.result.warnings.length - 50} more.
                  </li>
                )}
              </ul>
            </details>
          )}
        </div>
      )}
      {state.message && <p className="text-xs text-brand">{state.message}</p>}
    </form>
  );
}
