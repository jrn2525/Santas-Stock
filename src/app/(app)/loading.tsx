export default function Loading() {
  return (
    <>
      <header>
        <div className="h-8 w-48 animate-pulse rounded bg-card" />
        <div className="mt-2 h-4 w-64 animate-pulse rounded bg-card" />
      </header>

      <div className="mt-8 space-y-4">
        <div className="h-32 animate-pulse rounded-lg border border-rule bg-card" />
        <div className="h-48 animate-pulse rounded-lg border border-rule bg-card" />
        <div className="h-24 animate-pulse rounded-lg border border-rule bg-card" />
      </div>

      <p className="mt-6 text-sm text-ink-dim">Loading…</p>
    </>
  );
}
