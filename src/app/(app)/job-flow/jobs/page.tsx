import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default async function JobsPage() {
  await requireUser();

  const jobs = await prisma.jobberJob.findMany({
    orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
    include: {
      client: { select: { name: true } },
      property: { select: { address: true } },
    },
    take: 500,
  });

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Jobs</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Jobs synced from Jobber. Click Sync Jobs in Job Flow → Jobber to
          refresh.
        </p>
      </header>

      <div className="mt-8 overflow-hidden rounded-lg border border-rule">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="px-4 py-3">Job #</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Property</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Scheduled</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule bg-canvas">
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-ink-dim">
                  No jobs yet. Run Sync Jobs in Job Flow → Jobber.
                </td>
              </tr>
            ) : (
              jobs.map((j) => (
                <tr
                  key={j.id}
                  className="text-ink hover:bg-card/40"
                >
                  <td className="px-4 py-3 text-ink-dim">
                    <Link href={`/job-flow/jobs/${j.id}`}>{j.jobNumber ?? "—"}</Link>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/job-flow/jobs/${j.id}`}
                      className="hover:text-brand"
                    >
                      {j.title ?? "(untitled)"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{j.client?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-dim">
                    {j.property?.address ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-dim">{j.status || "—"}</td>
                  <td className="px-4 py-3 text-ink-dim">
                    {j.startAt ? dateFmt.format(j.startAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {j.total ? moneyFmt.format(Number(j.total)) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
