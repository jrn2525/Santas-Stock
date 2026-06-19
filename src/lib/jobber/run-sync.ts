import {
  syncClientsAndProperties,
  syncJobs,
  syncVisits,
  syncInvoices,
  syncNotes,
  type SyncResult,
  type JobsSyncResult,
  type VisitsSyncResult,
  type InvoicesSyncResult,
  type NotesSyncResult,
  type SyncWarning,
} from "@/lib/jobber/sync";
import { JobberNotConnectedError } from "@/lib/jobber/client";
import { runWithSyncLock } from "@/lib/jobber/sync-lock";
import { prisma } from "@/lib/prisma";

export type SyncRunContext = {
  trigger: "MANUAL" | "AUTO";
  triggeredByName?: string | null;
};

// How long sync-run logs are kept before auto-pruning.
const LOG_RETENTION_DAYS = 30;

export type JobFlowSyncResult = {
  customers: SyncResult | null;
  jobs: JobsSyncResult | null;
  visits: VisitsSyncResult | null;
  invoices: InvoicesSyncResult | null;
  notes: NotesSyncResult | null;
};

export type RunJobFlowSync = {
  // false when a sync was already in progress (skipped) — never overlaps.
  ran: boolean;
  notConnected: boolean;
  result: JobFlowSyncResult;
  phaseErrors: string[];
};

const emptyResult: JobFlowSyncResult = {
  customers: null,
  jobs: null,
  visits: null,
  invoices: null,
  notes: null,
};

/**
 * Run the full Job Flow sync (Customers → Jobs → Visits → Invoices → Notes),
 * the same sequence as the "Sync now" button and the scheduled auto-sync. Pure
 * data work — does NOT call revalidatePath, so it's safe to call outside a
 * request (e.g. the scheduler). Returns ran=false without doing anything if a
 * sync is already in flight — they share one lock so a sync can never overlap.
 */
export async function runJobFlowSync(
  context: SyncRunContext = { trigger: "MANUAL" },
): Promise<RunJobFlowSync> {
  const startedAt = new Date();
  const outcome = await runWithSyncLock(doFullSync);
  if (!outcome.ran) {
    return { ran: false, notConnected: false, result: emptyResult, phaseErrors: [] };
  }
  if (outcome.value.notConnected) {
    return { ran: false, notConnected: true, result: emptyResult, phaseErrors: [] };
  }

  // Record the run for the View Logs page. Never let a logging failure break
  // the sync itself.
  try {
    await recordSyncRun(
      context,
      startedAt,
      outcome.value.result,
      outcome.value.phaseErrors,
    );
  } catch (err) {
    console.error("[sync-run] failed to record sync log:", err);
  }

  return {
    ran: true,
    notConnected: false,
    result: outcome.value.result,
    phaseErrors: outcome.value.phaseErrors,
  };
}

type StoredWarning = {
  phase: string;
  level: "WARNING" | "ERROR";
  message: string;
  jobId: string | null;
  jobLabel: string | null;
};

function collectPhaseWarnings(
  phase: string,
  warnings: SyncWarning[] | undefined,
): StoredWarning[] {
  return (warnings ?? []).map((w) => ({
    phase,
    level: w.level ?? "WARNING",
    message: w.message,
    jobId: w.jobId ?? null,
    jobLabel: w.jobLabel ?? null,
  }));
}

async function recordSyncRun(
  context: SyncRunContext,
  startedAt: Date,
  result: JobFlowSyncResult,
  phaseErrors: string[],
): Promise<void> {
  const finishedAt = new Date();

  const warnings: StoredWarning[] = [
    ...collectPhaseWarnings("jobs", result.jobs?.warnings),
    ...collectPhaseWarnings("visits", result.visits?.warnings),
    ...collectPhaseWarnings("invoices", result.invoices?.warnings),
    ...collectPhaseWarnings("notes", result.notes?.warnings),
  ];

  const counts = {
    customers: { upserted: result.customers?.clientsUpserted ?? 0 },
    jobs: result.jobs
      ? { upserted: result.jobs.upserted, skipped: result.jobs.skipped }
      : null,
    visits: result.visits
      ? { upserted: result.visits.upserted, skipped: result.visits.skipped }
      : null,
    invoices: result.invoices
      ? { upserted: result.invoices.upserted, skipped: result.invoices.skipped }
      : null,
    notes: result.notes
      ? { upserted: result.notes.upserted, skipped: result.notes.skipped }
      : null,
  };

  // Status: FAILED if nothing synced (even Customers didn't run), PARTIAL if a
  // phase blew up but others completed, otherwise SUCCESS (row-level warnings
  // are still a success overall).
  const status =
    phaseErrors.length > 0
      ? result.customers
        ? "PARTIAL"
        : "FAILED"
      : "SUCCESS";

  await prisma.syncRun.create({
    data: {
      trigger: context.trigger,
      triggeredByName: context.triggeredByName ?? null,
      status,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      counts,
      phaseErrors,
      markedDeleted: result.jobs?.markedDeleted ?? 0,
      warnings,
    },
  });

  // Prune anything older than the retention window.
  const cutoff = new Date(
    Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  await prisma.syncRun.deleteMany({ where: { startedAt: { lt: cutoff } } });
}

async function doFullSync(): Promise<{
  notConnected: boolean;
  result: JobFlowSyncResult;
  phaseErrors: string[];
}> {
  const phaseErrors: string[] = [];
  let customers: SyncResult | null = null;
  let jobs: JobsSyncResult | null = null;
  let visits: VisitsSyncResult | null = null;
  let invoices: InvoicesSyncResult | null = null;
  let notes: NotesSyncResult | null = null;

  try {
    customers = await syncClientsAndProperties();
  } catch (err) {
    if (err instanceof JobberNotConnectedError) {
      return { notConnected: true, result: emptyResult, phaseErrors: [] };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Jobber customers sync failed:", err);
    phaseErrors.push(`Customers: ${msg}`);
  }

  if (customers) {
    try {
      jobs = await syncJobs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Jobber jobs sync failed:", err);
      phaseErrors.push(`Jobs: ${msg}`);
    }
  }

  if (jobs) {
    try {
      visits = await syncVisits();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Jobber visits sync failed:", err);
      phaseErrors.push(`Visits: ${msg}`);
    }
  }

  if (jobs) {
    try {
      invoices = await syncInvoices();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Jobber invoices sync failed:", err);
      phaseErrors.push(`Invoices: ${msg}`);
    }
  }

  if (jobs && visits) {
    try {
      notes = await syncNotes();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Jobber notes sync failed:", err);
      phaseErrors.push(`Notes: ${msg}`);
    }
  }

  return {
    notConnected: false,
    result: { customers, jobs, visits, invoices, notes },
    phaseErrors,
  };
}
