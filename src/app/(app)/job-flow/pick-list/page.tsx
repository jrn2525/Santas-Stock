import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default async function PickListIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const jobs = await prisma.jobberJob.findMany({
    where: query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { jobNumber: { contains: query, mode: "insensitive" } },
            { client: { name: { contains: query, mode: "insensitive" } } },
          ],
        }
      : undefined,
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
        <h1 className="text-3xl font-bold text-brand-hover">Pick List</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Click a job to view its pick list and print.
        </p>
      </header>

      <form className="mt-6 max-w-md" action="/job-flow/pick-list">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by job title, number, or customer..."
          className="w-full rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </form>

      <div className="mt-4 overflow-hidden rounded-lg border border-rule">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="px-4 py-3">Job #</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Property</th>
              <th className="px-4 py-3">Scheduled</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule bg-canvas">
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-ink-dim">
                  {query ? (
                    <>No jobs matched &ldquo;{query}&rdquo;.</>
                  ) : (
                    <>
                      No jobs yet.{" "}
                      <Link
                        href="/job-flow/jobber"
                        className="text-brand underline"
                      >
                        Run a Jobber sync
                      </Link>{" "}
                      to pull them in.
                    </>
                  )}
                </td>
              </tr>
            ) : (
              jobs.map((j) => (
                <tr key={j.id} className="text-ink hover:bg-card/40">
                  <td className="px-4 py-3 text-ink-dim">
                    <Link href={`/job-flow/pick-list/${j.id}`}>
                      {j.jobNumber ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/job-flow/pick-list/${j.id}`}
                      className="hover:text-brand"
                    >
                      {j.title ?? "(untitled)"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{j.client?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-dim">
                    {j.property?.address ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-dim">
                    {j.startAt ? dateFmt.format(j.startAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-dim">{j.status || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
