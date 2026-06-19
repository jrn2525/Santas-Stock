"use client";

import type { StaleJobDTO } from "@/lib/stale-jobs";
import { StaleJobsReview } from "./stale-jobs-review";

export function StaleJobsModal({
  jobs,
  onClose,
}: {
  jobs: StaleJobDTO[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stale-jobs-title"
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-auto rounded-lg border border-rule bg-card shadow-xl">
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
        <div className="p-5">
          <StaleJobsReview jobs={jobs} onDone={onClose} doneLabel="Done" />
        </div>
      </div>
    </div>
  );
}
