export default function JobFlowDashboardPage() {
  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Operational overview of jobs in flight.
        </p>
      </header>

      <section className="mt-8 rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Coming soon</h2>
        <p className="mt-2 text-sm text-ink-dim">
          Job pipeline summary, active jobs by stage, today&apos;s pick lists,
          and calendar at-a-glance will live here.
        </p>
      </section>
    </>
  );
}
