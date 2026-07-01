"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeServiceCall,
  reopenServiceCall,
} from "@/lib/actions/service-call";

const STEPS = [
  "Service Call",
  "Scheduled Service Call",
  "Completed Service Call",
] as const;

/**
 * The right-column card shown for Service Call jobs, replacing the normal Job
 * Flow chart. Three steps light up in order:
 *  1. Service Call — always (the job exists).
 *  2. Scheduled Service Call — once the job has a visit scheduled in Jobber.
 *  3. Completed Service Call — when the user marks it complete (→ Completed Jobs).
 */
export function ServiceCallFlowCard({
  jobId,
  scheduled,
  completed,
  canWrite,
}: {
  jobId: string;
  scheduled: boolean;
  completed: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const litCount = completed ? 3 : scheduled ? 2 : 1;

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) {
          setError(res.message ?? "Something went wrong.");
          return;
        }
        router.refresh();
      } catch {
        setError("Something went wrong — please try again.");
      }
    });
  }

  return (
    <section className="rounded-lg border border-white bg-brand/15 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
        Job Flow · Service Call
      </h2>

      <div className="mt-4 flex flex-col items-center gap-2">
        {STEPS.map((label, idx) => {
          const lit = idx < litCount;
          return (
            <div key={label} className="flex w-full flex-col items-center gap-2">
              <div
                className={`w-full max-w-[16rem] rounded-md border px-4 py-2 text-center text-sm font-medium ${
                  lit
                    ? "border-brand bg-brand text-ink"
                    : "border-white bg-card text-white"
                }`}
              >
                {label}
              </div>
              {idx < STEPS.length - 1 && <Arrow />}
            </div>
          );
        })}
      </div>

      {!scheduled && !completed && (
        <p className="mt-4 text-xs text-white">
          Not scheduled yet — the middle step lights up once the service call is
          scheduled in Jobber and synced.
        </p>
      )}

      {error && <p className="mt-4 text-xs text-yellow-100">{error}</p>}

      {canWrite && (
        <div className="mt-5 border-t border-white pt-4">
          {completed ? (
            <>
              <p className="text-xs text-white">
                Completed — this job now lives under{" "}
                <strong>Completed Jobs</strong>.
              </p>
              <button
                type="button"
                onClick={() => run(() => reopenServiceCall(jobId))}
                disabled={pending}
                className="mt-3 w-full rounded-md border border-white bg-canvas px-3 py-2 text-sm font-medium text-white transition hover:border-brand hover:text-brand disabled:opacity-50"
              >
                ← Reopen service call
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => run(() => completeServiceCall(jobId))}
              disabled={pending}
              className="w-full rounded-md bg-brand px-3 py-2 text-sm font-semibold text-ink transition hover:bg-brand-hover disabled:opacity-50"
            >
              {pending ? "Saving…" : "Mark Completed Service Call"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center text-white" aria-hidden>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M7 2v9m0 0l-3-3m3 3l3-3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
