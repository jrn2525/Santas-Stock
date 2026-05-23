import Link from "next/link";

/**
 * Reusable pagination footer. Renders "Showing X–Y of Z" with
 * Previous / Next links that preserve other URL params (search,
 * filters). Used on /inventory/items, /inventory/kits, and
 * /job-flow/jobs.
 *
 * The current page comes in via searchParams.page on the parent
 * server component; the parent does the take/skip math itself and
 * just renders this for the UI piece.
 */
export function Pagination({
  page,
  total,
  pageSize,
  baseUrl,
  preserved,
}: {
  /** 1-indexed page number */
  page: number;
  /** Total result count (across all pages) */
  total: number;
  /** Items per page */
  pageSize: number;
  /** The path the page links should target, e.g. "/inventory/items" */
  baseUrl: string;
  /** Other query params to preserve on the prev/next links */
  preserved: Record<string, string>;
}) {
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  function buildHref(targetPage: number): string {
    const params = new URLSearchParams(preserved);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `${baseUrl}?${qs}` : baseUrl;
  }

  const prevDisabled = safePage <= 1;
  const nextDisabled = safePage >= totalPages;

  return (
    <nav
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-dim no-print"
      aria-label="Pagination"
    >
      <p>
        Showing{" "}
        <strong className="text-ink tabular-nums">{start}</strong>–
        <strong className="text-ink tabular-nums">{end}</strong> of{" "}
        <strong className="text-ink tabular-nums">{total}</strong>
      </p>
      <div className="flex items-center gap-2">
        {prevDisabled ? (
          <span className="rounded-md border border-rule px-3 py-1.5 text-ink-dim opacity-50">
            ← Previous
          </span>
        ) : (
          <Link
            href={buildHref(safePage - 1)}
            className="rounded-md border border-rule bg-canvas px-3 py-1.5 text-ink hover:border-brand"
          >
            ← Previous
          </Link>
        )}
        <span className="tabular-nums">
          Page {safePage} of {totalPages}
        </span>
        {nextDisabled ? (
          <span className="rounded-md border border-rule px-3 py-1.5 text-ink-dim opacity-50">
            Next →
          </span>
        ) : (
          <Link
            href={buildHref(safePage + 1)}
            className="rounded-md border border-rule bg-canvas px-3 py-1.5 text-ink hover:border-brand"
          >
            Next →
          </Link>
        )}
      </div>
    </nav>
  );
}

/**
 * Parse a `page` URL search param. Returns a positive integer (1+),
 * defaulting to 1 for missing or invalid input.
 */
export function parsePageParam(raw: string | undefined): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}
