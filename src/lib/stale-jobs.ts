import type { JobStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STAGE_LABELS } from "@/lib/job-flow";
import { customerLabel, customerNameSelect } from "@/lib/customer-name";

// A job that exists in Santa's Stock but was deleted in Jobber, shown in the
// review pop-up after a sync. Plain serializable shape so it can cross the
// server-action boundary into the client modal.
export type StaleJobDTO = {
  id: string;
  jobNumber: string | null;
  title: string | null;
  clientName: string;
  stage: JobStage;
  stageLabel: string;
  // True if any of the job's lines have inventory allocated — deleting will
  // return that inventory to stock.
  hasAllocations: boolean;
  // True if the job reached a terminal stage (Ready / Deactivated).
  isTerminal: boolean;
  deletedAt: string | null;
};

/**
 * The jobs to show in the "deleted in Jobber" review pop-up: flagged as
 * deleted in Jobber and not yet dismissed ("stop showing this"). Newest
 * detections first.
 */
export async function listStaleJobs(): Promise<StaleJobDTO[]> {
  const rows = await prisma.jobberJob.findMany({
    where: { deletedInJobberAt: { not: null }, staleDismissedAt: null },
    orderBy: [{ deletedInJobberAt: "desc" }],
    select: {
      id: true,
      jobNumber: true,
      title: true,
      currentStage: true,
      deletedInJobberAt: true,
      client: { select: customerNameSelect },
      lineItems: {
        where: { isAllocated: true },
        select: { id: true },
        take: 1,
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    jobNumber: r.jobNumber,
    title: r.title,
    clientName: customerLabel(r.client),
    stage: r.currentStage,
    stageLabel: STAGE_LABELS[r.currentStage],
    hasAllocations: r.lineItems.length > 0,
    isTerminal: r.currentStage === "COMPLETE" || r.currentStage === "DEACTIVATED",
    deletedAt: r.deletedInJobberAt ? r.deletedInJobberAt.toISOString() : null,
  }));
}
