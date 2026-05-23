import Link from "next/link";

/**
 * Top-level 404 for URLs that don't match any route at all (outside the
 * authenticated (app) group). Self-contained — no sidebar / header
 * dependency since the user may not be signed in.
 */
export default function RootNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-wider text-ink-dim">404</p>
        <h1 className="mt-2 text-3xl font-bold text-brand-hover">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-ink-dim">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/job-flow/dashboard"
          className="mt-6 inline-block rounded-md bg-brand px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-hover"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
