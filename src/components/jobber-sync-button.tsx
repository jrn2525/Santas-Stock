"use client";

import { useActionState } from "react";
import {
  syncJobberCustomers,
  type SyncFormState,
} from "@/lib/actions/jobber";

const empty: SyncFormState = { errors: {}, message: null };

export function JobberSyncButton() {
  const [state, action, pending] = useActionState<SyncFormState>(
    syncJobberCustomers,
    empty,
  );

  return (
    <form action={action} className="inline-flex flex-col gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-ink hover:bg-brand-hover disabled:opacity-50"
      >
        {pending ? "Syncing..." : "Sync now"}
      </button>

      {state.result && (
        <p className="text-xs text-ink-dim">
          ✓ Synced {state.result.clientsUpserted} customers.
        </p>
      )}
      {state.message && <p className="text-xs text-brand">{state.message}</p>}
    </form>
  );
}
