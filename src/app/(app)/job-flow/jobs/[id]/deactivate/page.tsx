import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, WRITE_ROLES } from "@/lib/auth-helpers";
import { isValidTransition } from "@/lib/job-flow";
import {
  DeactivateForm,
  type DeactivateLine,
} from "@/components/job-flow/deactivate-form";

export const dynamic = "force-dynamic";

export default async function DeactivatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(WRITE_ROLES);
  const { id } = await params;

  const job = await prisma.jobberJob.findUnique({
    where: { id },
    include: {
      lineItems: {
        orderBy: [{ position: "asc" }],
        include: {
          item: { select: { id: true, name: true } },
          kit: {
            include: {
              items: {
                include: { item: { select: { name: true } } },
                orderBy: { item: { name: "asc" } },
              },
            },
          },
        },
      },
    },
  });
  if (!job) notFound();

  const canTransition = isValidTransition(job.currentStage, "DEACTIVATED");
  const alreadyDeactivated = job.currentStage === "DEACTIVATED";

  const lines: DeactivateLine[] = job.lineItems.map((li) => ({
    id: li.id,
    name:
      li.kit?.name ??
      li.item?.name ??
      li.rawName ??
      "(unnamed line)",
    quantity: Number(li.quantity),
    kind: li.kit ? "kit" : li.item ? "item" : "unresolved",
    components: li.kit
      ? li.kit.items.map((ki) => ({
          name: ki.item.name,
          quantity: Number(ki.quantity),
        }))
      : [],
  }));

  return (
    <>
      <header>
        <p className="text-xs uppercase tracking-wider text-ink-dim">
          <Link
            href={`/job-flow/jobs/${job.id}`}
            className="hover:text-ink"
          >
            ← {job.title ?? "Job"}
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-bold text-brand-hover">
          Deactivate Job
        </h1>
        <p className="mt-1 text-sm text-ink-dim">
          {job.jobNumber && <>Job #{job.jobNumber} · </>}
          Choose what happens to each line of allocated inventory before
          closing this job out.
        </p>
      </header>

      {alreadyDeactivated ? (
        <p className="mt-6 rounded-md border border-rule bg-card p-4 text-sm text-ink-dim">
          This job has already been deactivated.{" "}
          <Link
            href={`/job-flow/jobs/${job.id}`}
            className="text-brand hover:underline"
          >
            Back to job
          </Link>
          .
        </p>
      ) : !canTransition ? (
        <p className="mt-6 rounded-md border border-yellow-700/40 bg-yellow-500/10 p-4 text-sm text-yellow-100">
          Can&apos;t deactivate from the current stage (
          {job.currentStage}). Move the job to Inspection first.
        </p>
      ) : lines.length === 0 ? (
        <p className="mt-6 rounded-md border border-rule bg-card p-4 text-sm text-ink-dim">
          This job has no pick list lines. There&apos;s nothing to return
          or scrap.
        </p>
      ) : (
        <DeactivateForm jobId={job.id} lines={lines} />
      )}
    </>
  );
}
