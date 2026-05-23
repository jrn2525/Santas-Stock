"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Top-level error boundary for crashes outside the (app) group (e.g.
 * the sign-in page or any public route). Self-contained — no app
 * chrome since the user isn't necessarily authenticated.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-wider text-red-300">
          Something went wrong
        </p>
        <h1 className="mt-2 text-3xl font-bold text-brand-hover">
          Page hit an error
        </h1>
        <p className="mt-2 text-sm text-red-200">
          {error.message || "Unknown error"}
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-red-300/70">
            Error ID: <code className="font-mono">{error.digest}</code>
          </p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-hover"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-md border border-rule bg-canvas px-4 py-2 text-sm font-semibold text-ink hover:border-brand"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
