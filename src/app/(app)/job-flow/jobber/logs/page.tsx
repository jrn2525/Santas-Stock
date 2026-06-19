import Link from "next/link";
import { WRITE_ROLES, requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { clearSyncLogs } from "@/lib/actions/jobber";
import { dateTimeFormatET } from "@/lib/datetime";

export const dynamic = "force-dynamic";

const dateFormatter = dateTimeFormatET;

type StoredWarning = {
  phase: string;
  level: "WARNING" | "ERROR";
  message: string;
  jobId: string | null;
  jobLabel: string | null;
};

type PhaseCount = { upserted: number; skipped?: number } | null;
type RunCounts = {
  customers?: { upserted: number };
  jobs?: PhaseCount;
  visits?: PhaseCount;
  invoices?: PhaseCount;
  notes?: PhaseCount;
} | null;

// Phases that actually record warnings (the customers phase never does).
const PHASES = ["jobs", "visits", "invoices", "notes"] as const;

export default async function SyncLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; phase?: string }>;
}) {
  const user = await requireRole(WRITE_ROLES);
  const isAdmin = user.role === "ADMIN";
  const { level: levelParam, phase: phaseParam } = await searchParams;
  const levelFilter = levelParam === "errors" ? "errors" : "all";
  const phaseFilter =
    phaseParam && (PHASES as readonly string[]).includes(phaseParam)
      ? phaseParam
      : "all";

  const runs = await prisma.syncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 200,
  });

  function filterWarnings(raw: unknown): StoredWarning[] {
    const list = Array.isArray(raw) ? (raw as StoredWarning[]) : [];
    return list.filter((w) => {
      if (levelFilter === "errors" && w.level !== "ERROR") return false;
      if (phaseFilter !== "all" && w.phase !== phaseFilter) return false;
      return true;
    });
  }

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-dim">
            <Link href="/job-flow/jobber" className="hover:text-ink">
              ← Jobber
            </Link>
          </p>
          <h1 className="mt-2 text-3xl font-bold text-brand-hover">Sync logs</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Every Job Flow sync (manual and scheduled) from the last 30 days,
            with the warnings and errors each produced and the job they relate
            to. Newest first.
          </p>
        </div>
        {isAdmin && runs.length > 0 && (
          <form action={clearSyncLogs}>
            <button
              type="submit"
              className="rounded-md border border-brand bg-canvas px-3 py-2 text-sm font-medium text-brand hover:bg-brand hover:text-ink"
            >
              Clear logs
            </button>
          </form>
        )}
      </header>

      <form
        className="mt-6 flex flex-wrap items-end gap-3"
        action="/job-flow/jobber/logs"
      >
        <div>
          <label
            htmlFor="level"
            className="block text-xs font-medium text-ink-dim"
          >
            Show
          </label>
          <select
            id="level"
            name="level"
            defaultValue={levelFilter}
            className="mt-1 rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="all">Warnings &amp; errors</option>
            <option value="errors">Errors only</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="phase"
            className="block text-xs font-medium text-ink-dim"
          >
            Phase
          </label>
          <select
            id="phase"
            name="phase"
            defaultValue={phaseFilter}
            className="mt-1 rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="all">All phases</option>
            <option value="jobs">Jobs</option>
            <option value="visits">Visits</option>
            <option value="invoices">Invoices</option>
            <option value="notes">Notes</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-brand bg-canvas px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand hover:text-ink"
        >
          Apply
        </button>
        {(levelFilter !== "all" || phaseFilter !== "all") && (
          <Link
            href="/job-flow/jobber/logs"
            className="rounded-md border border-rule bg-canvas px-4 py-2 text-sm font-medium text-ink hover:border-brand"
          >
            Clear filters
          </Link>
        )}
      </form>

      {runs.length === 0 ? (
        <p className="mt-8 text-sm text-ink-dim">
          No syncs recorded yet. Run a sync from the{" "}
          <Link href="/job-flow/jobber" className="text-brand underline">
            Jobber page
          </Link>
          .
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {runs.map((run) => {
            const warnings = filterWarnings(run.warnings);
            const counts = (run.counts ?? null) as RunCounts;
            return (
              <section
                key={run.id}
                className="rounded-lg border border-rule bg-card p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={run.status} />
                      <span className="text-sm font-medium text-ink">
                        {dateFormatter.format(run.startedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-dim">
                      {run.trigger === "AUTO"
                        ? "Automatic (scheduled)"
                        : `Manual${run.triggeredByName ? ` · ${run.triggeredByName}` : ""}`}
                      {run.durationMs != null && (
                        <> · {(run.durationMs / 1000).toFixed(1)}s</>
                      )}
                      {run.markedDeleted > 0 && (
                        <>
                          {" · "}
                          <Link
                            href="/job-flow/jobber/deleted"
                            className="text-brand underline hover:text-brand-hover"
                          >
                            {run.markedDeleted} deleted in Jobber
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <CountsLine counts={counts} />
                </div>

                {run.phaseErrors.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {run.phaseErrors.map((e, i) => (
                      <li
                        key={i}
                        className="rounded border border-brand/40 bg-canvas px-3 py-2 text-xs text-brand"
                      >
                        Phase failed — {e}
                      </li>
                    ))}
                  </ul>
                )}

                {warnings.length === 0 ? (
                  <p className="mt-3 text-xs text-ink-dim">
                    {levelFilter === "errors" || phaseFilter !== "all"
                      ? "No matching warnings for this run."
                      : "No warnings — clean run."}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1">
                    {warnings.map((w, i) => (
                      <li
                        key={i}
                        className="flex flex-wrap items-center gap-2 rounded border border-rule bg-canvas px-3 py-2 text-xs"
                      >
                        <LevelTag level={w.level} />
                        <span className="rounded bg-card px-1.5 py-0.5 uppercase tracking-wide text-ink-dim">
                          {w.phase}
                        </span>
                        <span className="text-ink">{w.message}</span>
                        {w.jobId ? (
                          <Link
                            href={`/job-flow/jobs/${w.jobId}`}
                            className="font-medium text-brand underline hover:text-brand-hover"
                          >
                            {w.jobLabel ?? "View job"} →
                          </Link>
                        ) : w.jobLabel ? (
                          <span className="text-ink-dim">({w.jobLabel})</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "SUCCESS"
      ? "bg-card text-green-400"
      : status === "PARTIAL"
        ? "bg-brand/15 text-brand"
        : "bg-brand text-ink";
  const label =
    status === "SUCCESS" ? "✓ Clean" : status === "PARTIAL" ? "⚠ Partial" : "✗ Failed";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function LevelTag({ level }: { level: "WARNING" | "ERROR" }) {
  return level === "ERROR" ? (
    <span className="rounded bg-brand px-1.5 py-0.5 font-medium text-ink">
      Error
    </span>
  ) : (
    <span className="rounded bg-brand/15 px-1.5 py-0.5 font-medium text-brand">
      Warning
    </span>
  );
}

function CountsLine({ counts }: { counts: RunCounts }) {
  if (!counts) return null;
  const parts: string[] = [];
  if (counts.customers) parts.push(`Customers ${counts.customers.upserted}`);
  if (counts.jobs)
    parts.push(`Jobs ${counts.jobs.upserted}/${counts.jobs.skipped ?? 0}`);
  if (counts.visits)
    parts.push(`Visits ${counts.visits.upserted}/${counts.visits.skipped ?? 0}`);
  if (counts.invoices)
    parts.push(
      `Invoices ${counts.invoices.upserted}/${counts.invoices.skipped ?? 0}`,
    );
  if (counts.notes)
    parts.push(`Notes ${counts.notes.upserted}/${counts.notes.skipped ?? 0}`);
  if (parts.length === 0) return null;
  return (
    <p className="text-xs text-ink-dim">
      {parts.join(" · ")}
      <span className="block text-[10px] text-ink-muted">
        upserted / skipped
      </span>
    </p>
  );
}
