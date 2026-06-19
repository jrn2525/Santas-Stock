"use client";

import { useState, useTransition } from "react";
import type { StaleJobDTO } from "@/lib/stale-jobs";
import { deleteStaleJob, dismissStaleJob } from "@/lib/actions/stale-jobs";

export function StaleJobsModal({
  jobs: initialJobs,
  onClose,
}: {
  jobs: StaleJobDTO[];
  onClose: () => void;
}) {
  const [jobs, setJobs] = useState<StaleJobDTO[]>(initialJobs);
  // Job ids the user has ticked "stop showing this" for.
  const [dismissChecked, setDismissChecked] = useState<Set<string>>(new Set());
  // Job id currently awaiting a second click to confirm deletion.
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
      const res = await deleteStaleJob(id);
      setBusyId(null);
      setConfirmingId(null);
      if (!res.ok) {
        setError(res.message ?? "Could not delete the job.");
        return;
      }
      setJobs((prev) => {
        const next = prev.filter((j) => j.id !== id);
        if (next.length === 0) onClose();
        return next;
      });
    });
  }

  function handleDone() {
    const toDismiss = jobs.filter((j) => dismissChecked.has(j.id)).map((j) => j.id);
    if (toDismiss.length === 0) {
      onClose();
      return;
    }
    startTransition(async () => {
      await Promise.all(toDismiss.map((id) => dismissStaleJob(id)));
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stale-jobs-title"
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-rule bg-card shadow-xl">
        <div className="border-b border-rule p-5">
          <h2 id="stale-jobs-title" className="text-lg font-semibold text-ink">
            Jobs deleted in Jobber
          </h2>
          <p className="mt-1 text-sm text-ink-dim">
            These {jobs.length} job{jobs.length === 1 ? "" : "s"} are still in
            Santa&apos;s Stock but were deleted from Jobber. Delete a job to
            remove it and return any allocated inventory to stock, or tick
            &ldquo;Stop showing&rdquo; to keep it and hide it from this list.
          </p>
        </div>

        {error && (
          <div className="mx-5 mt-4 rounded-md border border-brand/40 bg-canvas p-3 text-sm text-brand">
            {error}
          </div>
        )}

        <ul className="flex-1 divide-y divide-rule overflow-auto">
          {jobs.map((j) => {
            const confirming = confirmingId === j.id;
            const rowBusy = busyId === j.id && pending;
            return (
              <li key={j.id} className="flex items-start gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">
                    {j.jobNumber ? `Job #${j.jobNumber}` : "Job"}
                    {j.title ? <span className="text-ink-dim"> — {j.title}</span> : null}
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

        <div className="flex items-center justify-between border-t border-rule p-5">
          <p className="text-xs text-ink-dim">
            Unticked jobs you leave will appear again on the next sync.
          </p>
          <button
            type="button"
            onClick={handleDone}
            disabled={pending}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-hover disabled:opacity-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
