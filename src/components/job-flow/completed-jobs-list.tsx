"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCompletedJobs } from "@/lib/actions/service-call";

export type CompletedJobRow = {
  id: string;
  jobNumber: string | null;
  title: string | null;
  clientName: string;
  completedLabel: string;
};

export function CompletedJobsList({
  jobs,
  canWrite,
}: {
  jobs: CompletedJobRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allChecked = jobs.length > 0 && checked.size === jobs.length;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setChecked((prev) =>
      prev.size === jobs.length ? new Set() : new Set(jobs.map((j) => j.id)),
    );
  }

  function handleDelete() {
    const ids = Array.from(checked);
    if (ids.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await deleteCompletedJobs(ids);
        if (!res.ok) {
          setError(res.message ?? "Could not delete the selected jobs.");
          return;
        }
        setChecked(new Set());
        setConfirming(false);
        router.refresh();
      } catch {
        setError("Could not delete the selected jobs — please try again.");
      }
    });
  }

  if (jobs.length === 0) {
    return (
      <p className="mt-8 text-sm text-ink-dim">
        No completed service calls yet. When you mark a Service Call
        &ldquo;Completed Service Call&rdquo; on its job page, it moves here.
      </p>
    );
  }

  return (
    <div className="mt-6">
      {canWrite && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {confirming ? (
            <>
              <span className="text-sm text-ink">
                Delete {checked.size} job{checked.size === 1 ? "" : "s"}? This
                can&apos;t be undone.
              </span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-ink hover:bg-brand-hover disabled:opacity-50"
              >
                {pending ? "Deleting…" : "Confirm delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="rounded-md border border-rule px-3 py-1.5 text-sm font-medium text-ink-dim hover:text-ink disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={checked.size === 0}
              className="rounded-md border border-brand/50 px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete selected{checked.size > 0 ? ` (${checked.size})` : ""}
            </button>
          )}
          {error && <span className="text-sm text-brand">{error}</span>}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-rule">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-ink-dim">
            <tr>
              {canWrite && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    aria-label="Select all"
                    className="h-4 w-4 rounded border-rule"
                  />
                </th>
              )}
              <th className="px-4 py-3">Job #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Completed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule bg-canvas">
            {jobs.map((j) => (
              <tr key={j.id} className="text-ink hover:bg-card/40">
                {canWrite && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={checked.has(j.id)}
                      onChange={() => toggle(j.id)}
                      aria-label={`Select job ${j.jobNumber ?? j.id}`}
                      className="h-4 w-4 rounded border-rule"
                    />
                  </td>
                )}
                <td className="px-4 py-3 text-ink-dim">
                  <Link href={`/job-flow/jobs/${j.id}`} className="hover:text-brand">
                    {j.jobNumber ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/job-flow/jobs/${j.id}`} className="hover:text-brand">
                    {j.clientName}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/job-flow/jobs/${j.id}`}
                    className="font-medium hover:text-brand"
                  >
                    {j.title ?? "(untitled)"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-dim whitespace-nowrap">
                  {j.completedLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
