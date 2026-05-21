"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Global error boundary for the (app) route group. Catches anything
 * that throws below this point — failed Prisma queries, server-action
 * errors, runtime exceptions in client components — and surfaces a
 * friendly recovery screen instead of Next.js's default error page.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to browser console for inspection. Production logging
    // would hook in here too.
    console.error("App error boundary caught:", error);
  }, [error]);

  return (
    <>
      <header>
        <p className="text-xs uppercase tracking-wider text-red-300">
          Something went wrong
        </p>
        <h1 className="mt-2 text-3xl font-bold text-brand-hover">
          Page hit an error
        </h1>
        <p className="mt-1 text-sm text-ink-dim">
          The page couldn&apos;t finish loading. You can try again, head
          back to the dashboard, or grab the details below for a bug
          report.
        </p>
      </header>

      <section className="mt-6 rounded-lg border border-red-700/40 bg-red-900/10 p-4">
        <p className="text-sm font-medium text-red-200">
          {error.message || "Unknown error"}
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-red-300/70">
            Error ID: <code className="font-mono">{error.digest}</code>
          </p>
        )}
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-hover"
        >
          Try again
        </button>
        <Link
          href="/job-flow/dashboard"
          className="rounded-md border border-rule bg-canvas px-4 py-2 text-sm font-semibold text-ink hover:border-brand"
        >
          Back to dashboard
        </Link>
      </div>
    </>
  );
}
