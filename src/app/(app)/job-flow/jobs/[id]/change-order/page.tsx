import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, WRITE_ROLES } from "@/lib/auth-helpers";
import { STAGE_LABELS } from "@/lib/job-flow";

export const dynamic = "force-dynamic";

export default async function ChangeOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(WRITE_ROLES);
  const { id } = await params;

  const job = await prisma.jobberJob.findUnique({
    where: { id },
    select: { id: true, title: true, jobNumber: true, currentStage: true },
  });
  if (!job) notFound();

  return (
    <>
      <header>
        <p className="text-xs uppercase tracking-wider text-ink-dim">
          <Link href={`/job-flow/jobs/${job.id}`} className="hover:text-ink">
            ← {job.title ?? "Job"}
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-bold text-brand-hover">
          Change Order
        </h1>
        <p className="mt-1 text-sm text-ink-dim">
          {job.jobNumber && <>Job #{job.jobNumber} · </>}
          Current stage: <span className="text-ink">{STAGE_LABELS[job.currentStage]}</span>
        </p>
      </header>

      <section className="mt-8 rounded-lg border border-dashed border-rule bg-card p-8 text-center">
        <h2 className="text-lg font-semibold text-ink">
          Change Order editor — coming next
        </h2>
        <p className="mt-3 text-sm text-ink-dim">
          This page will let you edit the Pick List for this job at any stage —
          swap items, add new lines, remove lines, change quantities — with a
          live diff showing what returns to inventory and what gets pulled.
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          Shipping in the next build slice. For now, this button is wired so
          the route exists.
        </p>
      </section>
    </>
  );
}
