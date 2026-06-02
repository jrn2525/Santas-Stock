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
} from "@/lib/jobber/sync";
import { JobberNotConnectedError } from "@/lib/jobber/client";
import { runWithSyncLock } from "@/lib/jobber/sync-lock";

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
 * Run the full Job Flow sync (Customers → Jobs → Visits → [Invoices] → Notes),
 * the same sequence as the "Sync now" button. Pure data work — does NOT call
 * revalidatePath, so it's safe to call outside a request (e.g. the scheduler).
 * Returns ran=false without doing anything if any sync (manual, scheduled, or
 * webhook drain) is already in flight — they all share one lock so the heavy
 * sync can never overlap itself or the webhook processor.
 *
 * `includeInvoices` (default true) pulls every invoice to refresh billing
 * status. It's the heaviest phase (and the one most prone to Jobber's cost
 * throttle), so the scheduled auto-sync turns it OFF — billing status stays
 * fresh via the manual "Sync now" button and the invoice/payment webhooks.
 */
export async function runJobFlowSync(
  { includeInvoices = true }: { includeInvoices?: boolean } = {},
): Promise<RunJobFlowSync> {
  const outcome = await runWithSyncLock(() => doFullSync({ includeInvoices }));
  if (!outcome.ran) {
    return { ran: false, notConnected: false, result: emptyResult, phaseErrors: [] };
  }
  if (outcome.value.notConnected) {
    return { ran: false, notConnected: true, result: emptyResult, phaseErrors: [] };
  }
  return {
    ran: true,
    notConnected: false,
    result: outcome.value.result,
    phaseErrors: outcome.value.phaseErrors,
  };
}

async function doFullSync({
  includeInvoices,
}: {
  includeInvoices: boolean;
}): Promise<{
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

  if (jobs && includeInvoices) {
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
