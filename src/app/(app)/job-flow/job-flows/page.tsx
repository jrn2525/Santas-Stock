export default function JobFlowsPage() {
  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Job Flows</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Visual workflows that drive how a job moves through the business.
        </p>
      </header>

      <section className="mt-8 rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Coming soon</h2>
        <p className="mt-2 text-sm text-ink-dim">
          Graphical flow editor with stages, checklists, and per-job position
          tracking. This is the most complex piece and ships last.
        </p>
      </section>
    </>
  );
}
