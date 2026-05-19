import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const dayFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

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

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const customer = await prisma.client.findUnique({
    where: { id },
    include: {
      properties: {
        orderBy: { address: "asc" },
      },
      jobs: {
        orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
        include: { property: true },
      },
      notes: {
        orderBy: [{ noteCreatedAt: "desc" }],
      },
    },
  });

  if (!customer) notFound();

  const personal = [customer.firstName, customer.lastName]
    .filter((p) => p && p.trim())
    .join(" ")
    .trim();
  const displayName = personal || customer.name;
  const address = joinAddress(customer);

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-dim">
            <Link href="/job-flow/customers" className="hover:text-ink">
              ← Customers
            </Link>
          </p>
          <h1 className="mt-2 text-3xl font-bold text-brand-hover">
            {displayName}
          </h1>
          {customer.companyName && customer.companyName !== displayName && (
            <p className="mt-1 text-sm text-ink-dim">{customer.companyName}</p>
          )}
        </div>
        <Link
          href="/job-flow/jobber"
          className="rounded-md border border-rule bg-card px-3 py-2 text-sm font-medium text-ink hover:border-brand hover:text-brand"
        >
          Sync
        </Link>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Contact">
          {customer.emails.length === 0 && customer.phones.length === 0 ? (
            <p className="text-sm text-ink-dim">—</p>
          ) : (
            <div className="space-y-1 text-sm">
              {customer.emails.map((e) => (
                <div key={e}>
                  <a
                    href={`mailto:${e}`}
                    className="text-ink hover:text-brand"
                  >
                    {e}
                  </a>
                </div>
              ))}
              {customer.phones.map((p) => (
                <div key={p}>
                  <a
                    href={`tel:${p.replace(/[^+0-9]/g, "")}`}
                    className="text-ink-dim hover:text-brand"
                  >
                    {p}
                  </a>
                </div>
              ))}
            </div>
          )}
          {customer.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {customer.tags.map((t) => (
                <span
                  key={t}
                  className="inline-block rounded-full border border-rule bg-canvas px-2 py-0.5 text-xs text-ink"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card title="Service address">
          {address ? (
            <p className="text-sm text-ink whitespace-pre-line">{address}</p>
          ) : (
            <p className="text-sm text-ink-dim">—</p>
          )}
        </Card>

        <Card title="Properties">
          {customer.properties.length === 0 ? (
            <p className="text-sm text-ink-dim">No properties on file.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {customer.properties.map((p) => (
                <li key={p.id} className="text-ink">
                  {p.address}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section className="mt-6 rounded-lg border border-rule bg-card p-6">
        <header className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Jobs</h2>
            <p className="mt-1 text-sm text-ink-dim">
              All Jobber jobs for this customer.
            </p>
          </div>
          <span className="text-xs text-ink-dim">
            {customer.jobs.length} job{customer.jobs.length === 1 ? "" : "s"}
          </span>
        </header>

        {customer.jobs.length === 0 ? (
          <p className="mt-6 text-sm text-ink-dim">
            No jobs yet. Run Sync Jobs in Job Flow → Jobber to pull them in.
          </p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-md border border-rule">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left text-xs uppercase tracking-wider text-ink-dim">
                <tr>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Scheduled</th>
                  <th className="px-4 py-2">Property</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {customer.jobs.map((j) => (
                  <tr key={j.id} className="text-ink">
                    <td className="px-4 py-2 font-medium">
                      <Link
                        href={`/job-flow/jobs/${j.id}`}
                        className="hover:text-brand"
                      >
                        {j.title ?? "(untitled job)"}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-ink-dim">
                      {j.jobNumber ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-ink-dim">
                      {j.status || "—"}
                    </td>
                    <td className="px-4 py-2 text-ink-dim">
                      {j.startAt ? dayFmt.format(j.startAt) : "—"}
                    </td>
                    <td className="px-4 py-2 text-ink-dim">
                      {j.property?.address ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-dim">
                      {j.total != null ? moneyFmt.format(Number(j.total)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-rule bg-card p-6">
        <header className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Notes</h2>
            <p className="mt-1 text-sm text-ink-dim">
              Customer-level notes synced from Jobber.
            </p>
          </div>
          <span className="text-xs text-ink-dim">
            {customer.notes.length} note{customer.notes.length === 1 ? "" : "s"}
          </span>
        </header>

        {customer.notes.length === 0 ? (
          <p className="mt-6 text-sm text-ink-dim">
            No customer-level notes. Run Sync Notes in Job Flow → Jobber to pull
            them in.
          </p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {customer.notes.map((n) => (
              <li
                key={n.id}
                className="rounded border border-rule bg-canvas p-3"
              >
                <p className="text-ink whitespace-pre-line">{n.body}</p>
                {n.noteCreatedAt && (
                  <p className="mt-1 text-xs text-ink-dim">
                    {dayFmt.format(n.noteCreatedAt)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-rule bg-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
