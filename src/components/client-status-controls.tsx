"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setClientActive } from "@/lib/actions/clients";

type Stage = "idle" | "confirm" | "done";

/**
 * Buttons on the Customer detail page header for deactivating /
 * reactivating a customer. Deactivation pops a confirmation dialog
 * with an optional reason field. Reactivation is a single click since
 * undoing is harmless.
 */
export function ClientStatusControls({
  clientId,
  clientName,
  active,
}: {
  clientId: string;
  clientName: string;
  active: boolean;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close() {
    if (isPending) return;
    setStage("idle");
    setReason("");
    setError(null);
  }

  function openDeactivate() {
    setError(null);
    setReason("");
    setStage("confirm");
  }

  function runDeactivate() {
    setError(null);
    startTransition(async () => {
      try {
        await setClientActive(clientId, false, reason.trim() || null);
        setStage("done");
        router.refresh();
        setTimeout(() => setStage("idle"), 1200);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to deactivate customer.",
        );
      }
    });
  }

  function runReactivate() {
    setError(null);
    startTransition(async () => {
      try {
        await setClientActive(clientId, true);
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Failed to reactivate customer.",
        );
      }
    });
  }

  if (active) {
    return (
      <>
        <button
          type="button"
          onClick={openDeactivate}
          className="rounded-md border border-red-700/60 bg-red-900/10 px-3 py-2 text-sm font-medium text-red-200 hover:border-red-500 hover:bg-red-900/30 no-print"
          title="Mark this customer as no longer with us"
        >
          Deactivate customer
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
                    Deactivate {clientName}?
                  </h2>
                  <p className="mt-2 text-sm text-white">
                    The customer will be marked inactive. Their existing
                    job history, kits, and data all stay intact — they
                    just disappear from the default Jobs list filter
                    until reactivated. Job-level deactivations on their
                    individual jobs (with inventory return/scrap) are a
                    separate concern; do those first if needed.
                  </p>
                  <label
                    htmlFor="deact-reason"
                    className="mt-4 block text-sm font-medium text-ink"
                  >
                    Reason (optional)
                  </label>
                  <textarea
                    id="deact-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="e.g. Sold their house, moved out of area, switched providers"
                    maxLength={500}
                    className="mt-1 block w-full rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
                      onClick={runDeactivate}
                      disabled={isPending}
                      className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-ink hover:bg-red-600 disabled:cursor-not-allowed"
                    >
                      {isPending ? "Deactivating…" : "Deactivate"}
                    </button>
                  </div>
                </>
              )}

              {stage === "done" && (
                <>
                  <h2 className="text-lg font-semibold text-red-200">
                    Customer deactivated
                  </h2>
                  <p className="mt-2 text-sm text-white">
                    {clientName} is now marked inactive.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  // Currently inactive: single Reactivate button
  return (
    <div className="flex flex-wrap items-center gap-3 no-print">
      {error && (
        <span className="text-sm text-red-200">{error}</span>
      )}
      <button
        type="button"
        onClick={runReactivate}
        disabled={isPending}
        className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-ink hover:bg-brand-hover disabled:cursor-not-allowed"
        title="Mark this customer as active again"
      >
        {isPending ? "Reactivating…" : "Reactivate customer"}
      </button>
    </div>
  );
}
