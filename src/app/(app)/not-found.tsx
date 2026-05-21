import Link from "next/link";

/**
 * 404 fallback for the (app) route group. Triggered when a server
 * component calls notFound() (e.g. an item or job that doesn't exist)
 * or when a URL doesn't match any defined route in this group.
 */
export default function NotFound() {
  return (
    <>
      <header>
        <p className="text-xs uppercase tracking-wider text-ink-dim">404</p>
        <h1 className="mt-2 text-3xl font-bold text-brand-hover">
          Not found
        </h1>
        <p className="mt-1 text-sm text-ink-dim">
          That page or record doesn&apos;t exist (or you don&apos;t have
          access to it). Try one of the links below.
        </p>
      </header>

      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NavCard
          href="/job-flow/dashboard"
          label="Job Flow"
          hint="Today's visits, pipeline, materials needed"
        />
        <NavCard
          href="/job-flow/jobs"
          label="Jobs"
          hint="Every job synced from Jobber"
        />
        <NavCard
          href="/inventory/dashboard"
          label="Inventory"
          hint="Items, kits, stock levels"
        />
        <NavCard
          href="/inventory/items"
          label="Items"
          hint="Search the master item list"
        />
      </section>
    </>
  );
}

function NavCard({
  href,
  label,
  hint,
}: {
  href: string;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-rule bg-card p-4 transition hover:border-brand"
    >
      <div className="font-semibold text-ink">{label}</div>
      <div className="mt-1 text-xs text-ink-dim">{hint}</div>
    </Link>
  );
}
