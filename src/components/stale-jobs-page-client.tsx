"use client";

import { useRouter } from "next/navigation";
import type { StaleJobDTO } from "@/lib/stale-jobs";
import { StaleJobsReview } from "./stale-jobs-review";

// Wraps the shared review for the standalone page: after the user finishes,
// refresh so dismissed jobs drop off and the count updates from the server.
export function StaleJobsPageClient({ jobs }: { jobs: StaleJobDTO[] }) {
  const router = useRouter();
  return (
    <StaleJobsReview
      jobs={jobs}
      onDone={() => router.refresh()}
      doneLabel="Save changes"
    />
  );
}
