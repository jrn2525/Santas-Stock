"use client";

import { useActionState } from "react";
import {
  syncJobberJobs,
  syncJobberVisits,
  syncJobberNotes,
  type JobsSyncFormState,
  type VisitsSyncFormState,
  type NotesSyncFormState,
} from "@/lib/actions/jobber";

const emptyJobs: JobsSyncFormState = { errors: {}, message: null };
const emptyVisits: VisitsSyncFormState = { errors: {}, message: null };
const emptyNotes: NotesSyncFormState = { errors: {}, message: null };

export function JobberJobsSyncButton() {
  const [state, action, pending] = useActionState<JobsSyncFormState>(
    syncJobberJobs,
    emptyJobs,
  );
  return (
    <SyncSection
      label="Jobs"
      hint="Pulls every Job from Jobber. Run Sync Customers first if any jobs reference a client that isn't here yet."
      action={action}
      pending={pending}
      summary={
        state.result
          ? `${state.result.upserted} upserted, ${state.result.skipped} skipped`
          : null
      }
      warnings={state.result?.warnings ?? []}
      message={state.message}
    />
  );
}

export function JobberVisitsSyncButton() {
  const [state, action, pending] = useActionState<VisitsSyncFormState>(
    syncJobberVisits,
    emptyVisits,
  );
  return (
    <SyncSection
      label="Visits (for Calendar)"
      hint="Pulls scheduled appointments tied to each Job. Run Sync Jobs first."
      action={action}
      pending={pending}
      summary={
        state.result
          ? `${state.result.upserted} upserted, ${state.result.skipped} skipped`
          : null
      }
      warnings={state.result?.warnings ?? []}
      message={state.message}
    />
  );
}

export function JobberNotesSyncButton() {
  const [state, action, pending] = useActionState<NotesSyncFormState>(
    syncJobberNotes,
    emptyNotes,
  );
  return (
    <SyncSection
      label="Notes / Internal notes"
      hint="Pulls notes attached to Customers, Jobs, and Visits. Run the other syncs first so notes can be linked to their parent."
      action={action}
      pending={pending}
      summary={
        state.result
          ? `${state.result.upserted} upserted, ${state.result.skipped} skipped`
          : null
      }
      warnings={state.result?.warnings ?? []}
      message={state.message}
    />
  );
}

function SyncSection({
  label,
  hint,
  action,
  pending,
  summary,
  warnings,
  message,
}: {
  label: string;
  hint: string;
  action: (payload: FormData) => void;
  pending: boolean;
  summary: string | null;
  warnings: string[];
  message: string | null;
}) {
  return (
    <div className="rounded-md border border-rule bg-canvas p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-[200px]">
          <h3 className="text-sm font-semibold text-ink">{label}</h3>
          <p className="mt-1 text-xs text-ink-dim">{hint}</p>
        </div>
        <form action={action}>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-ink hover:bg-brand-hover disabled:opacity-50"
          >
            {pending ? "Syncing..." : "Sync now"}
          </button>
        </form>
      </div>

      {summary && <p className="mt-3 text-xs text-ink-dim">✓ {summary}</p>}
      {warnings.length > 0 && (
        <details className="mt-2 rounded border border-rule bg-card p-2">
          <summary className="cursor-pointer text-xs text-brand">
            {warnings.length} warning(s)
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-ink-dim">
            {warnings.slice(0, 50).map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
            {warnings.length > 50 && (
              <li className="italic">…and {warnings.length - 50} more.</li>
            )}
          </ul>
        </details>
      )}
      {message && <p className="mt-2 text-xs text-brand">{message}</p>}
    </div>
  );
}
