// Per-job in-process serialization for every inventory-mutating job action
// (stage changes, allocation, change orders, inspection, deactivation, release).
//
// A double-click, two open tabs, or a retry can fire two mutations on the same
// job at once. Without serialization both read the same stale state and
// double-apply inventory side effects (return stock twice, decrement a tote
// twice, allocate the same lines twice). Chaining tasks per jobId means the
// second runs only AFTER the first finishes — by which point the first has
// updated the job/stock, so the second sees fresh state and its guards catch
// the duplicate harmlessly.
//
// Single Railway instance assumed — same model as the Jobber sync lock. If this
// ever runs multi-instance, back the guards with DB-level conditional updates.
const jobLocks = new Map<string, Promise<unknown>>();

export async function withJobLock<T>(
  jobId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prior = jobLocks.get(jobId) ?? Promise.resolve();
  // get + then + set run synchronously (no await between them), so concurrent
  // callers reliably chain instead of racing.
  const task = prior.catch(() => undefined).then(fn);
  jobLocks.set(jobId, task);
  try {
    return await task;
  } finally {
    // Only clear if we're still the tail of the chain, so we don't drop a
    // newer queued task's entry.
    if (jobLocks.get(jobId) === task) {
      jobLocks.delete(jobId);
    }
  }
}
