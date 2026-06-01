import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  syncClientsAndProperties,
  syncProductsAndServices,
  syncJobs,
  syncVisits,
  syncInvoices,
  syncNotes,
} from "@/lib/jobber/sync";
import { runWithSyncLock } from "@/lib/jobber/sync-lock";

/**
 * Map the set of pending webhook topics to the syncs we need to run.
 * Unknown topics are ignored (recorded but trigger no sync) so a topic we
 * don't recognize can never cause a surprise heavy pull.
 */
function classifyTopics(topics: Set<string>): {
  customers: boolean;
  jobs: boolean;
  visits: boolean;
  invoices: boolean;
  notes: boolean;
  inventory: boolean;
} {
  let customers = false;
  let jobs = false;
  let visits = false;
  let invoices = false;
  let notes = false;
  let inventory = false;

  for (const raw of topics) {
    const t = raw.toUpperCase();
    // Check NOTE before JOB/CLIENT so e.g. JOB_NOTE_* routes to the notes sync.
    if (t.includes("NOTE")) {
      notes = true;
    } else if (t.startsWith("CLIENT") || t.startsWith("PROPERTY")) {
      customers = true;
    } else if (t.startsWith("INVOICE") || t.startsWith("PAYMENT")) {
      // Billing changes update the job's invoice status (Billing Status column).
      invoices = true;
    } else if (t.startsWith("JOB")) {
      jobs = true;
    } else if (t.startsWith("VISIT")) {
      visits = true;
    } else if (
      t.startsWith("PRODUCT") ||
      t.startsWith("SERVICE") ||
      t.includes("PRODUCT_OR_SERVICE")
    ) {
      inventory = true;
    }
    // else: unrecognized topic — ignored.
  }

  return { customers, jobs, visits, invoices, notes, inventory };
}

const MAX_PASSES = 5;

async function runSafe(
  fn: () => Promise<unknown>,
  label: string,
  errors: string[],
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[jobber-webhook] ${label} sync failed:`, err);
    errors.push(`${label}: ${msg}`);
  }
}

/**
 * Drain PENDING Jobber webhook events. Coalesces all currently-pending
 * events into a single sync pass per affected domain, run in dependency
 * order (customers -> jobs -> visits -> notes; inventory is independent).
 * Reuses the existing bulk sync functions rather than per-entity fetches.
 */
export async function processJobberWebhookEvents(): Promise<void> {
  // Share the lock with the manual / scheduled full sync (runJobFlowSync) so a
  // webhook drain and a full sync can't run syncJobs at the same time and
  // collide on a job's line items. If a sync is already running we skip; the
  // events stay PENDING and the next drain picks them up.
  await runWithSyncLock(async () => {
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const pending = await prisma.syncEvent.findMany({
        where: { source: "jobber", status: "PENDING" },
        orderBy: { createdAt: "asc" },
        select: { id: true, eventType: true },
      });
      if (pending.length === 0) return;

      const need = classifyTopics(new Set(pending.map((e) => e.eventType)));
      const errors: string[] = [];

      if (need.customers) {
        await runSafe(syncClientsAndProperties, "customers", errors);
      }
      if (need.jobs) await runSafe(syncJobs, "jobs", errors);
      if (need.visits) await runSafe(syncVisits, "visits", errors);
      if (need.invoices) await runSafe(syncInvoices, "invoices", errors);
      if (need.notes) await runSafe(syncNotes, "notes", errors);
      if (need.inventory) {
        await runSafe(syncProductsAndServices, "inventory", errors);
      }

      const ids = pending.map((e) => e.id);
      await prisma.syncEvent.updateMany({
        where: { id: { in: ids } },
        data: {
          status: errors.length === 0 ? "PROCESSED" : "FAILED",
          processedAt: new Date(),
          error: errors.length === 0 ? null : errors.join("; "),
        },
      });

      if (
        need.customers ||
        need.jobs ||
        need.visits ||
        need.invoices ||
        need.notes
      ) {
        revalidatePath("/job-flow/jobs");
        revalidatePath("/job-flow/calendar");
        revalidatePath("/job-flow/pick-list");
        revalidatePath("/job-flow/dashboard");
        revalidatePath("/job-flow/clients");
      }
      if (need.inventory) {
        revalidatePath("/inventory/items");
        revalidatePath("/inventory/kits");
        revalidatePath("/inventory/dashboard");
      }
    }
  });
}
