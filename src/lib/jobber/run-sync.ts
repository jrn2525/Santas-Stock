import {
  syncClientsAndProperties,
  syncJobs,
  syncVisits,
  syncNotes,
  type SyncResult,
  type JobsSyncResult,
  type VisitsSyncResult,
  type NotesSyncResult,
} from "@/lib/jobber/sync";
import { JobberNotConnectedError } from "@/lib/jobber/client";

export type JobFlowSyncResult = {
  customers: SyncResult | null;
  jobs: JobsSyncResult | null;
  visits: VisitsSyncResult | null;
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
  notes: null,
};

// Single in-process lock shared by the manual "Sync now" button and the
// scheduled auto-sync, so the two can never run the heavy full sync at the
// same time. (Single Railway instance assumed.)
let running = false;

export function isJobFlowSyncRunning(): boolean {
  return running;
}

/**
 * Run the full Job Flow sync (Customers → Jobs → Visits → Notes), the same
 * sequence as the "Sync now" button. Pure data work — does NOT call
 * revalidatePath, so it's safe to call outside a request (e.g. the scheduler).
 * Returns ran=false without doing anything if a sync is already in flight.
 */
export async function runJobFlowSync(): Promise<RunJobFlowSync> {
  if (running) {
    return { ran: false, notConnected: false, result: emptyResult, phaseErrors: [] };
  }
  running = true;

  const phaseErrors: string[] = [];
  let customers: SyncResult | null = null;
  let jobs: JobsSyncResult | null = null;
  let visits: VisitsSyncResult | null = null;
  let notes: NotesSyncResult | null = null;

  try {
    try {
      customers = await syncClientsAndProperties();
    } catch (err) {
      if (err instanceof JobberNotConnectedError) {
        return { ran: false, notConnected: true, result: emptyResult, phaseErrors: [] };
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
      ran: true,
      notConnected: false,
      result: { customers, jobs, visits, notes },
      phaseErrors,
    };
  } finally {
    running = false;
  }
}
