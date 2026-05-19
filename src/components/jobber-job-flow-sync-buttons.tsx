"use client";

import { useActionState } from "react";
import {
  syncJobberJobs,
  type JobsSyncFormState,
  type JobFlowSyncResult,
} from "@/lib/actions/jobber";

const emptyJobs: JobsSyncFormState = { errors: {}, message: null };

export function JobberJobsSyncButton() {
  const [state, action, pending] = useActionState<JobsSyncFormState>(
    syncJobberJobs,
    emptyJobs,
  );

  const summary = state.result ? buildSummary(state.result) : null;
  const warnings = state.result ? mergeWarnings(state.result) : [];

  return (
    <SyncSection
      label="Customers, Jobs, Visits, and Notes"
      hint="One click pulls Customers + Properties, then Jobs, then Visits (for Calendar), then Notes."
      action={action}
      pending={pending}
      summary={summary}
      warnings={warnings}
      message={state.message}
    />
  );
}

function buildSummary(r: JobFlowSyncResult): string | null {
  const parts: string[] = [];
  if (r.customers)
    parts.push(`Customers ${r.customers.clientsUpserted} upserted`);
  if (r.jobs)
    parts.push(`Jobs ${r.jobs.upserted} upserted / ${r.jobs.skipped} skipped`);
  if (r.visits)
    parts.push(
      `Visits ${r.visits.upserted} upserted / ${r.visits.skipped} skipped`,
    );
  if (r.notes)
    parts.push(`Notes ${r.notes.upserted} upserted / ${r.notes.skipped} skipped`);
  return parts.length ? parts.join(" · ") : null;
}

function mergeWarnings(r: JobFlowSyncResult): string[] {
  return [
    ...(r.jobs?.warnings ?? []).map((w) => `[Jobs] ${w}`),
    ...(r.visits?.warnings ?? []).map((w) => `[Visits] ${w}`),
    ...(r.notes?.warnings ?? []).map((w) => `[Notes] ${w}`),
  ];
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
