import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { to2Dp } from "@/lib/format";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
});

const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
  timeStyle: "short",
});

function parseDateParam(raw: string | undefined): Date | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse the JobStageEvent.notes string written by deactivateJob.
 * Today's format is:
 *   "[reason — ]Returned X, scrapped Y.[ — Removed N kit(s) from customer tote.]"
 *
 * If we ever add structured fields to JobStageEvent for the deactivation
 * summary, swap this out for direct reads.
 */
function parseDeactivationNotes(raw: string | null): {
  reason: string | null;
  returned: number | null;
  scrapped: number | null;
  kitsRemoved: number | null;
} {
  if (!raw) {
    return { reason: null, returned: null, scrapped: null, kitsRemoved: null };
  }

  const returnedMatch = raw.match(/Returned (\d+(?:\.\d+)?), scrapped (\d+(?:\.\d+)?)\./);
  const kitsMatch = raw.match(/Removed (\d+) kits? from customer tote\./);

  let reason: string | null = null;
  if (returnedMatch) {
    const beforeReturned = raw.slice(0, returnedMatch.index ?? 0).trim();
    const stripped = beforeReturned.replace(/\s*—\s*$/, "").trim();
    reason = stripped.length > 0 ? stripped : null;
  } else {
    // No structured summary found; treat the whole thing as the reason
    reason = raw.trim() || null;
  }

  return {
    reason,
    returned: returnedMatch ? Number(returnedMatch[1]) : null,
    scrapped: returnedMatch ? Number(returnedMatch[2]) : null,
    kitsRemoved: kitsMatch ? Number(kitsMatch[1]) : null,
  };
}

export default async function DeactivationsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; range?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;

  const now = new Date();
  const thisYearStart = new Date(now.getFullYear(), 0, 1);
  const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
  const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);

  const allTime = sp.range === "all";
  let fromDate = allTime ? null : parseDateParam(sp.from);
  let toDate = allTime ? null : parseDateParam(sp.to);
  if (!allTime && !fromDate && !toDate) {
    fromDate = thisYearStart;
    toDate = now;
  }
  const toDateInclusive = toDate
    ? new Date(
        toDate.getFullYear(),
        toDate.getMonth(),
        toDate.getDate(),
        23,
        59,
        59,
        999,
      )
    : null;

  const atFilter =
    fromDate || toDateInclusive
      ? {
          at: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDateInclusive ? { lte: toDateInclusive } : {}),
          },
        }
      : {};

  const events = await prisma.jobStageEvent.findMany({
    where: { toStage: "DEACTIVATED", ...atFilter },
    orderBy: { at: "desc" },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          jobNumber: true,
          client: { select: { id: true, name: true } },
          property: { select: { address: true } },
        },
      },
      byUser: { select: { name: true } },
    },
  });

  type Row = {
    eventId: string;
    at: Date;
    jobId: string;
    jobNumber: string | null;
    jobTitle: string | null;
    clientId: string | null;
    clientName: string;
    propertyAddress: string | null;
    byName: string | null;
    reason: string | null;
    returned: number | null;
    scrapped: number | null;
    kitsRemoved: number | null;
  };

  const rows: Row[] = events.map((e) => {
    const parsed = parseDeactivationNotes(e.notes);
    return {
      eventId: e.id,
      at: e.at,
      jobId: e.job.id,
      jobNumber: e.job.jobNumber,
      jobTitle: e.job.title,
      clientId: e.job.client?.id ?? null,
      clientName: e.job.client?.name ?? "—",
      propertyAddress: e.job.property?.address ?? null,
      byName: e.byUser?.name ?? null,
      reason: parsed.reason,
      returned: parsed.returned,
      scrapped: parsed.scrapped,
      kitsRemoved: parsed.kitsRemoved,
    };
  });

  const uniqueCustomerIds = new Set(
    rows.map((r) => r.clientId).filter((id): id is string => id !== null),
  );
  const totalReturned = rows.reduce((s, r) => s + (r.returned ?? 0), 0);
  const totalScrapped = rows.reduce((s, r) => s + (r.scrapped ?? 0), 0);
  const totalKitsRemoved = rows.reduce(
    (s, r) => s + (r.kitsRemoved ?? 0),
    0,
  );

  let rangeLabel: string;
  if (allTime) {
    rangeLabel = "All time";
  } else if (fromDate && toDate) {
    rangeLabel = `${dateFmt.format(fromDate)} – ${dateFmt.format(toDate)}`;
  } else if (fromDate) {
    rangeLabel = `${dateFmt.format(fromDate)} onward`;
  } else if (toDate) {
    rangeLabel = `Through ${dateFmt.format(toDate)}`;
  } else {
    rangeLabel = "All time";
  }

  const fromInput = fromDate ? toIsoDate(fromDate) : "";
  const toInput = toDate ? toIsoDate(toDate) : "";

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-brand-hover">
            Deactivations
          </h1>
          <p className="mt-1 text-sm text-ink-dim no-print">
            Customer jobs that hit the Deactivated terminal stage.
            Filter by date range for a tax-year snapshot, then Print
            Report for accounting or season recap.
          </p>
          <p className="mt-1 hidden text-sm print:block">
            Deactivations Report · {rangeLabel}
          </p>
        </div>
        <div className="no-print">
          <PrintButton />
        </div>
      </header>

      <form
        className="mt-6 flex flex-wrap items-end gap-3 no-print"
        action="/job-flow/deactivations"
      >
        <div>
          <label
            htmlFor="from"
            className="block text-xs font-medium text-ink-dim"
          >
            From
          </label>
          <input
            id="from"
            type="date"
            name="from"
            defaultValue={fromInput}
            className="mt-1 rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label
            htmlFor="to"
            className="block text-xs font-medium text-ink-dim"
          >
            To
          </label>
          <input
            id="to"
            type="date"
            name="to"
            defaultValue={toInput}
            className="mt-1 rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-brand bg-canvas px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand hover:text-ink"
        >
          Apply
        </button>
        <div className="flex flex-wrap gap-2">
          <PresetLink
            href={`/job-flow/deactivations?from=${toIsoDate(thisYearStart)}&to=${toIsoDate(now)}`}
            label="This year"
          />
          <PresetLink
            href={`/job-flow/deactivations?from=${toIsoDate(lastYearStart)}&to=${toIsoDate(lastYearEnd)}`}
            label="Last year"
          />
          <PresetLink
            href={`/job-flow/deactivations?range=all`}
            label="All time"
          />
        </div>
      </form>

      <p className="mt-3 text-xs text-ink-dim no-print">
        Currently showing: <strong className="text-ink">{rangeLabel}</strong>
      </p>

      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <StatCard label="Deactivations" value={rows.length.toString()} />
        <StatCard
          label="Customers affected"
          value={uniqueCustomerIds.size.toString()}
        />
        <StatCard
          label="Units returned"
          value={to2Dp(totalReturned)}
          hint="Back into shared inventory"
        />
        <StatCard
          label="Units scrapped"
          value={to2Dp(totalScrapped)}
          hint="Permanent loss"
        />
      </section>

      <div className="mt-6 overflow-hidden rounded-lg border border-rule">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Property</th>
              <th className="px-4 py-3 text-right">Returned</th>
              <th className="px-4 py-3 text-right">Scrapped</th>
              <th className="px-4 py-3 text-right">Tote kits</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule bg-canvas">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-12 text-center text-ink-dim"
                >
                  No deactivations recorded in this date range.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.eventId}
                  className="text-ink hover:bg-card/40"
                >
                  <td className="px-4 py-3 text-ink-dim whitespace-nowrap">
                    {dateTimeFmt.format(r.at)}
                  </td>
                  <td className="px-4 py-3 font-medium">{r.clientName}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/job-flow/jobs/${r.jobId}`}
                      className="hover:text-brand"
                    >
                      {r.jobNumber && (
                        <span className="text-ink-dim">#{r.jobNumber} · </span>
                      )}
                      {r.jobTitle ?? "(untitled)"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-dim">
                    {r.propertyAddress ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-300">
                    {r.returned != null ? to2Dp(r.returned) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-300">
                    {r.scrapped != null ? to2Dp(r.scrapped) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-dim">
                    {r.kitsRemoved != null && r.kitsRemoved > 0
                      ? r.kitsRemoved
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-dim italic">
                    {r.reason ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-dim whitespace-nowrap">
                    {r.byName ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-card text-sm font-semibold text-ink">
              <tr>
                <td className="px-4 py-3" colSpan={4}>
                  Total
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {to2Dp(totalReturned)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {to2Dp(totalScrapped)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {totalKitsRemoved > 0 ? totalKitsRemoved : "—"}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {rows.length > 0 && (
        <p className="mt-3 text-xs text-ink-dim no-print">
          Showing {rows.length}{" "}
          {rows.length === 1 ? "deactivation" : "deactivations"}. Sorted
          newest first.
        </p>
      )}
    </>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-rule bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-ink-dim">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-ink tabular-nums">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-dim">{hint}</div>}
    </div>
  );
}

function PresetLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-md border border-rule bg-canvas px-3 py-2 text-xs font-medium text-ink hover:border-brand"
    >
      {label}
    </Link>
  );
}
