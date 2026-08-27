import Link from "next/link";
import type { CustomerEra, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { getSettings } from "@/lib/settings";
import { Pagination, parsePageParam } from "@/components/pagination";

export const dynamic = "force-dynamic";

function statusBadge(
  active: boolean,
  era: CustomerEra,
): { label: string; cls: string } {
  if (!active) {
    return {
      label: "Deactivated",
      cls: "border-brand/40 bg-brand/10 text-brand",
    };
  }
  if (era === "EXISTING") {
    return { label: "Existing", cls: "border-brand/40 bg-brand/15 text-ink" };
  }
  return { label: "New", cls: "border-rule bg-canvas text-white" };
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requireUser();
  const { defaultPageSize: PAGE_SIZE } = await getSettings();
  const { q, status, page: pageParam } = await searchParams;
  const query = q?.trim() ?? "";
  // status filter: "active" (default), "inactive", or "all"
  const statusFilter =
    status === "inactive" || status === "all" ? status : "active";
  const page = parsePageParam(pageParam);

  const andClauses: Prisma.ClientWhereInput[] = [];
  if (query) {
    andClauses.push({
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { companyName: { contains: query, mode: "insensitive" } },
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
      ],
    });
  }
  if (statusFilter === "active") {
    andClauses.push({ active: true });
  } else if (statusFilter === "inactive") {
    andClauses.push({ active: false });
  }
  const where: Prisma.ClientWhereInput =
    andClauses.length > 0 ? { AND: andClauses } : {};

  const total = await prisma.client.count({ where });
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, maxPage);
  const clients = await prisma.client.findMany({
      where,
      // Sort by the Last Name column now that it leads the table. sortName is
      // the last name for people and the company name for businesses; rows
      // synced before that column existed fall back to name.
      orderBy: [{ sortName: { sort: "asc", nulls: "last" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        companyName: true,
        emails: true,
        phones: true,
        serviceCity: true,
        serviceState: true,
        customerStatus: true,
        active: true,
        _count: { select: { jobs: true } },
      },
      take: PAGE_SIZE,
      skip: (safePage - 1) * PAGE_SIZE,
    });

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Customers</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Customers synced from Jobber, listed last name first to match how the
          totes are labeled. Click a row to open the customer&apos;s detail page.
        </p>
      </header>

      <form
        className="mt-6 flex flex-wrap items-end gap-3"
        action="/job-flow/clients"
      >
        <div className="min-w-[18rem] flex-1">
          <label
            htmlFor="client-search"
            className="block text-xs font-medium text-ink-dim"
          >
            Search
          </label>
          <input
            id="client-search"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Name or company..."
            className="mt-1 block w-full rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label
            htmlFor="status-filter"
            className="block text-xs font-medium text-ink-dim"
          >
            Status
          </label>
          <select
            id="status-filter"
            name="status"
            defaultValue={statusFilter}
            className="mt-1 rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="active">Active only</option>
            <option value="inactive">Deactivated only</option>
            <option value="all">All customers</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-brand bg-canvas px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand hover:text-ink"
        >
          Apply
        </button>
        {(query || statusFilter !== "active") && (
          <Link
            href="/job-flow/clients"
            className="rounded-md border border-rule bg-canvas px-4 py-2 text-sm font-medium text-ink hover:border-brand"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="mt-4 overflow-x-auto rounded-lg border border-rule">
        <table className="w-full min-w-[68rem] text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="px-4 py-3">Last Name</th>
              <th className="px-4 py-3">First Name</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Jobs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule bg-canvas">
            {clients.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-ink-dim">
                  {query || statusFilter !== "active" ? (
                    <>No customers match the current filters.</>
                  ) : (
                    <>No customers yet. Run a sync in Job Flow → Jobber.</>
                  )}
                </td>
              </tr>
            ) : (
              clients.map((c) => {
                const badge = statusBadge(c.active, c.customerStatus);
                const location = [c.serviceCity, c.serviceState]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <tr key={c.id} className="text-ink hover:bg-card/40">
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/job-flow/clients/${c.id}`}
                        className="hover:text-brand"
                      >
                        {c.lastName?.trim() ||
                          (c.companyName?.trim() ? "—" : c.name)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/job-flow/clients/${c.id}`}
                        className="hover:text-brand"
                      >
                        {c.firstName?.trim() || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-dim">
                      <Link
                        href={`/job-flow/clients/${c.id}`}
                        className="hover:text-brand"
                      >
                        {c.companyName?.trim() || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-dim">
                      {c.emails[0] ?? c.phones[0] ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-ink-dim">
                      {location || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-dim">
                      {c._count.jobs}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={safePage}
        total={total}
        pageSize={PAGE_SIZE}
        baseUrl="/job-flow/clients"
        preserved={Object.fromEntries(
          Object.entries({
            q: query,
            status: statusFilter === "active" ? "" : statusFilter,
          }).filter(([, v]) => v !== ""),
        )}
      />
    </>
  );
}
