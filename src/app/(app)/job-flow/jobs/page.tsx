export default function JobsPage() {
  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Jobs</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Jobs synced from Jobber. Each job is the overall scope of work for a
          client.
        </p>
      </header>

      <section className="mt-8 rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Coming soon</h2>
        <p className="mt-2 text-sm text-ink-dim">
          Job list, detail view, and status filters. Data will sync from Jobber
          using the same pattern as customers.
        </p>
      </section>
    </>
  );
}
