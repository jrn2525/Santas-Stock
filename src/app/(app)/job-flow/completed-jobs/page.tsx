import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { dateTimeFormatET } from "@/lib/datetime";
import {
  CompletedJobsList,
  type CompletedJobRow,
} from "@/components/job-flow/completed-jobs-list";
import { customerLabel, customerNameSelect } from "@/lib/customer-name";

export const dynamic = "force-dynamic";

const dateTimeFmt = dateTimeFormatET;

export default async function CompletedJobsPage() {
  const user = await requireUser();
  const canWrite = user.role === "ADMIN" || user.role === "MANAGER";

  const jobs = await prisma.jobberJob.findMany({
    where: { serviceCallCompletedAt: { not: null } },
    orderBy: { serviceCallCompletedAt: "desc" },
    select: {
      id: true,
      jobNumber: true,
      title: true,
      serviceCallCompletedAt: true,
      client: { select: customerNameSelect },
    },
  });

  const rows: CompletedJobRow[] = jobs.map((j) => ({
    id: j.id,
    jobNumber: j.jobNumber,
    title: j.title,
    clientName: customerLabel(j.client),
    completedLabel: j.serviceCallCompletedAt
      ? dateTimeFmt.format(j.serviceCallCompletedAt)
      : "—",
  }));

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Completed Jobs</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Service Call jobs you&apos;ve marked completed. Tick the ones you no
          longer need and Delete — deleted jobs won&apos;t come back on the next
          Jobber sync.
        </p>
      </header>

      <CompletedJobsList jobs={rows} canWrite={canWrite} />
    </>
  );
}
