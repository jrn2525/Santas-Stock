import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const customers = await prisma.client.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { companyName: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { phone: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { properties: true } },
    },
    take: 200,
  });

  return (
    <>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand-hover">Customers</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Synced from Jobber. Read-only here — edit customers in Jobber and
            re-sync.
          </p>
        </div>
        <Link
          href="/jobber"
          className="rounded-md border border-rule bg-card px-3 py-2 text-sm font-medium text-ink hover:border-brand hover:text-brand"
        >
          Sync
        </Link>
      </header>

      <form className="mt-6 max-w-md" action="/customers">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by name, company, email, or phone..."
          className="w-full rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </form>

      <div className="mt-4 overflow-hidden rounded-lg border border-rule">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3 text-right">Properties</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule bg-canvas">
            {customers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-ink-dim">
                  {query ? (
                    <>No customers matched &ldquo;{query}&rdquo;.</>
                  ) : (
                    <>
                      No customers yet.{" "}
                      <Link href="/jobber" className="text-brand underline">
                        Run a Jobber sync
                      </Link>{" "}
                      to pull them in.
                    </>
                  )}
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="text-ink">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-ink-dim">{c.companyName ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-dim">{c.email ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-dim">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c._count.properties}
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
