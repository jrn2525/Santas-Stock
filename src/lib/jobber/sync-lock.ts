// One in-process lock shared by every heavy Jobber sync path: the manual
// "Sync now" button and the scheduled auto-sync (both via runJobFlowSync), and
// the webhook-triggered drain (processJobberWebhookEvents). They all call the
// same bulk sync functions, and syncJobs deletes-and-recreates each job's line
// items — so two running at once could leave a job with missing or duplicated
// line items. Funnelling them through one flag means only one runs at a time.
// (Single Railway instance assumed — same model as the other in-process locks.)
let running = false;

/**
 * Run `fn` under the shared sync lock. Returns { ran: false } immediately if a
 * sync is already in progress (callers decide what to do — the manual button
 * reports "already running", the scheduler and webhook drain just skip). The
 * check-and-set is synchronous, so two callers can't both acquire it.
 */
export async function runWithSyncLock<T>(
  fn: () => Promise<T>,
): Promise<{ ran: true; value: T } | { ran: false }> {
  if (running) return { ran: false };
  running = true;
  try {
    return { ran: true, value: await fn() };
  } finally {
    running = false;
  }
}
