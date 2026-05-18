import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

function joinAddress(c: {
  serviceStreet1: string | null;
  serviceCity: string | null;
  serviceState: string | null;
  serviceZip: string | null;
  serviceCountry: string | null;
}): string {
  const parts = [
    c.serviceStreet1,
    [c.serviceCity, c.serviceState, c.serviceZip].filter(Boolean).join(" ").trim(),
    c.serviceCountry,
  ].filter((p) => p && p.trim().length > 0);
  return parts.join(", ");
}

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
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { emails: { has: query } },
            { phones: { has: query } },
            { tags: { has: query } },
            { serviceStreet1: { contains: query, mode: "insensitive" } },
            { serviceCity: { contains: query, mode: "insensitive" } },
            { serviceZip: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
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
          href="/job-flow/jobber"
          className="rounded-md border border-rule bg-card px-3 py-2 text-sm font-medium text-ink hover:border-brand hover:text-brand"
        >
          Sync
        </Link>
      </header>

      <form className="mt-6 max-w-md" action="/job-flow/customers">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by name, company, email, phone, tag, or address..."
          className="w-full rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </form>

      <div className="mt-4 overflow-hidden rounded-lg border border-rule">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Service address</th>
              <th className="px-4 py-3">Tags</th>
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
                      <Link href="/job-flow/jobber" className="text-brand underline">
                        Run a Jobber sync
                      </Link>{" "}
                      to pull them in.
                    </>
                  )}
                </td>
              </tr>
            ) : (
              customers.map((c) => {
                const personal = [c.firstName, c.lastName]
                  .filter((p) => p && p.trim())
                  .join(" ")
                  .trim();
                const address = joinAddress(c);
                return (
                  <tr key={c.id} className="text-ink align-top">
                    <td className="px-4 py-3 font-medium">
                      {personal || c.name}
                    </td>
                    <td className="px-4 py-3 text-ink-dim">
                      {c.companyName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-ink-dim">
                      {c.emails.length === 0 && c.phones.length === 0 ? (
                        "—"
                      ) : (
                        <div className="space-y-1">
                          {c.emails.map((e) => (
                            <div key={e}>{e}</div>
                          ))}
                          {c.phones.map((p) => (
                            <div key={p} className="text-ink-dim">
                              {p}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-dim">
                      {address || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {c.tags.length === 0 ? (
                        <span className="text-ink-dim">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {c.tags.map((t) => (
                            <span
                              key={t}
                              className="inline-block rounded-full border border-rule bg-card px-2 py-0.5 text-xs text-ink"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
