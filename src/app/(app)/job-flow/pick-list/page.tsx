export default function PickListPage() {
  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Pick List</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Items to physically pull from inventory for upcoming jobs.
        </p>
      </header>

      <section className="mt-8 rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Coming soon</h2>
        <p className="mt-2 text-sm text-ink-dim">
          Per-job and per-day pick lists generated from job requirements and
          kits.
        </p>
      </section>
    </>
  );
}
