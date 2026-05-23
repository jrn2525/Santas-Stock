"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetJob } from "@/lib/actions/reset-job";

type Stage = "idle" | "confirm" | "type" | "done";

/**
 * Two-step safety prompt that wraps the destructive resetJob action.
 *
 *  1. Click the Reset button -> "Are you sure?" modal with OK / Cancel.
 *  2. OK advances to a second modal: type the word RESET (capitals) to
 *     confirm. Reset button is disabled until the input matches exactly.
 *  3. Reset runs the server action. On success the page refreshes.
 *
 * Designed so somebody can't blow up a job by misclicking.
 */
export function ResetJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function open() {
    setError(null);
    setTyped("");
    setStage("confirm");
  }

  function close() {
    if (isPending) return;
    setStage("idle");
    setTyped("");
    setError(null);
  }

  function advance() {
    setStage("type");
  }

  function run() {
    if (typed !== "RESET") return;
    setError(null);
    startTransition(async () => {
      try {
        await resetJob(jobId, "RESET");
        setStage("done");
        router.refresh();
        // Small delay so the user sees the "Reset complete" state
        setTimeout(() => {
          setStage("idle");
          setTyped("");
        }, 1500);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to reset the job.",
        );
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="rounded-md border border-red-700/60 bg-red-900/10 px-3 py-2 text-sm font-medium text-red-200 hover:border-red-500 hover:bg-red-900/30 no-print"
        title="Reset this job back to its imported state"
      >
        Reset job
      </button>

      {stage !== "idle" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 no-print"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-lg border border-rule bg-canvas p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {stage === "confirm" && (
              <>
                <h2 className="text-lg font-semibold text-ink">
                  Reset this job?
                </h2>
                <p className="mt-2 text-sm text-white">
                  You are about to reset this job. Allocation, inspection
                  decisions, shortages, stage timeline, and tote effects
                  will all be unwound. Inventory will be restored. The
                  pick list and Change Order history will stay.
                </p>
                <p className="mt-2 text-sm text-yellow-200">
                  This cannot be undone.
                </p>
                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-md border border-rule bg-canvas px-4 py-2 text-sm font-semibold text-ink hover:border-brand"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={advance}
                    className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-hover"
                  >
                    OK
                  </button>
                </div>
              </>
            )}

            {stage === "type" && (
              <>
                <h2 className="text-lg font-semibold text-ink">
                  Type RESET to confirm
                </h2>
                <p className="mt-2 text-sm text-white">
                  To finish resetting this job, type{" "}
                  <strong className="font-mono text-red-200">RESET</strong>{" "}
                  (capital letters) in the box below.
                </p>
                <input
                  type="text"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoFocus
                  placeholder="RESET"
                  className="mt-4 block w-full rounded-md border border-rule bg-card px-3 py-2 font-mono text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  disabled={isPending}
                />
                {error && (
                  <p className="mt-3 rounded-md border border-red-700/40 bg-red-900/20 px-3 py-2 text-sm text-red-200">
                    {error}
                  </p>
                )}
                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={close}
                    disabled={isPending}
                    className="rounded-md border border-rule bg-canvas px-4 py-2 text-sm font-semibold text-ink hover:border-brand disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={run}
                    disabled={typed !== "RESET" || isPending}
                    className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                      typed === "RESET" && !isPending
                        ? "bg-red-700 text-ink hover:bg-red-600"
                        : "cursor-not-allowed bg-canvas text-white"
                    }`}
                  >
                    {isPending ? "Resetting…" : "Reset"}
                  </button>
                </div>
              </>
            )}

            {stage === "done" && (
              <>
                <h2 className="text-lg font-semibold text-green-200">
                  Reset complete
                </h2>
                <p className="mt-2 text-sm text-white">
                  The job is back at NEW. Inventory has been restored.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
