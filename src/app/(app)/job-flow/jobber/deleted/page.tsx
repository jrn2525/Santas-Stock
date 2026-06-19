import Link from "next/link";
import { WRITE_ROLES, requireRole } from "@/lib/auth-helpers";
import { listStaleJobs } from "@/lib/stale-jobs";
import { StaleJobsPageClient } from "@/components/stale-jobs-page-client";

export const dynamic = "force-dynamic";

export default async function DeletedInJobberPage() {
  await requireRole(WRITE_ROLES);
  const jobs = await listStaleJobs();

  return (
    <>
      <header>
        <p className="text-xs uppercase tracking-wider text-ink-dim">
          <Link href="/job-flow/jobber" className="hover:text-ink">
            ← Jobber
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-bold text-brand-hover">
          Deleted in Jobber
        </h1>
        <p className="mt-1 text-sm text-ink-dim">
          Jobs that still exist in Santa&apos;s Stock but were deleted from
          Jobber. Delete one to remove it and return any allocated inventory to
          stock, or keep it and tick &ldquo;Stop showing&rdquo; to hide it from
          this list and the post-sync pop-up.
        </p>
      </header>

      <div className="mt-8">
        <StaleJobsPageClient jobs={jobs} />
      </div>
    </>
  );
}
