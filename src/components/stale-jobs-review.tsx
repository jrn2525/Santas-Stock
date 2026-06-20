"use client";

import { useState, useTransition } from "react";
import type { StaleJobDTO } from "@/lib/stale-jobs";
import { deleteStaleJob, dismissStaleJob } from "@/lib/actions/stale-jobs";

/**
 * The interactive list of jobs deleted in Jobber: per-row Delete (with a
 * confirm step, returns inventory to stock) and a "stop showing" checkbox.
 * Shared by the post-sync pop-up (StaleJobsModal) and the always-available
 * review page. onDone fires after the user finishes (dismissing any ticked
 * jobs first) — the modal uses it to close, the page to refresh.
 */
export function StaleJobsReview({
  jobs: initialJobs,
  onDone,
  doneLabel,
}: {
  jobs: StaleJobDTO[];
  onDone: () => void;
  doneLabel: string;
}) {
  const [jobs, setJobs] = useState<StaleJobDTO[]>(initialJobs);
  const [dismissChecked, setDismissChecked] = useState<Set<string>>(new Set());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleDismiss(id: string) {
    setDismissChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDelete(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      try {
        const res = await deleteStaleJob(id);
        setBusyId(null);
        setConfirmingId(null);
        if (!res.ok) {
          setError(res.message ?? "Could not delete the job.");
          return;
        }
        setJobs((prev) => prev.filter((j) => j.id !== id));
      } catch {
        setBusyId(null);
        setConfirmingId(null);
        setError("Couldn't delete the job — please try again.");
      }
    });
  }

  function handleDone() {
    const toDismiss = jobs
      .filter((j) => dismissChecked.has(j.id))
      .map((j) => j.id);
    setError(null);
    startTransition(async () => {
      try {
        if (toDismiss.length > 0) {
          await Promise.all(toDismiss.map((id) => dismissStaleJob(id)));
        }
        onDone();
      } catch {
        setError("Couldn't save changes — please try again.");
      }
    });
  }

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-ink-dim">
        No jobs are currently deleted in Jobber. 🎉
      </p>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-4 rounded-md border border-brand/40 bg-canvas p-3 text-sm text-brand">
          {error}
        </div>
      )}

      <ul className="divide-y divide-rule overflow-hidden rounded-lg border border-rule">
        {jobs.map((j) => {
          const confirming = confirmingId === j.id;
          const rowBusy = busyId === j.id && pending;
          return (
            <li key={j.id} className="flex items-start gap-4 bg-card p-5">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">
                  {j.jobNumber ? `Job #${j.jobNumber}` : "Job"}
                  {j.title ? (
                    <span className="text-ink-dim"> — {j.title}</span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-sm text-ink-dim">{j.clientName}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-canvas px-2 py-0.5 text-ink-dim">
                    {j.stageLabel}
                  </span>
                  {j.hasAllocations && (
                    <span className="rounded bg-brand/15 px-2 py-0.5 font-medium text-brand">
                      Has allocated inventory — will be returned to stock
                    </span>
                  )}
                  {j.isTerminal && (
                    <span className="rounded bg-canvas px-2 py-0.5 text-ink-dim">
                      Completed/Deactivated
                    </span>
                  )}
                </div>

                <label className="mt-3 flex items-center gap-2 text-xs text-ink-dim">
                  <input
                    type="checkbox"
                    checked={dismissChecked.has(j.id)}
                    onChange={() => toggleDismiss(j.id)}
                    disabled={pending}
                    className="h-4 w-4 rounded border-rule"
                  />
                  Stop showing this job
                </label>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                {confirming ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDelete(j.id)}
                      disabled={pending}
                      className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-ink hover:bg-brand-hover disabled:opacity-50"
                    >
                      {rowBusy ? "Deleting..." : "Confirm delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      disabled={pending}
                      className="rounded-md border border-rule px-3 py-1.5 text-xs font-medium text-ink-dim hover:text-ink disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setConfirmingId(j.id);
                    }}
                    disabled={pending}
                    className="rounded-md border border-brand/50 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/10 disabled:opacity-50"
                  >
                    Delete job
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-ink-dim">
          Unticked jobs you leave will appear again on the next sync.
        </p>
        <button
          type="button"
          onClick={handleDone}
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-hover disabled:opacity-50"
        >
          {doneLabel}
        </button>
      </div>
    </>
  );
}
