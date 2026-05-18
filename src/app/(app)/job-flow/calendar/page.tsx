export default function CalendarPage() {
  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Calendar</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Scheduled jobs and visits at a glance.
        </p>
      </header>

      <section className="mt-8 rounded-lg border border-rule bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Coming soon</h2>
        <p className="mt-2 text-sm text-ink-dim">
          Month/week/day views with jobs plotted from Jobber visits.
        </p>
      </section>
    </>
  );
}
