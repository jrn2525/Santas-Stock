"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  deactivateJob,
  type DeactivateDecision,
} from "@/lib/actions/deactivate";
import { to2Dp } from "@/lib/format";

export type DeactivateLine = {
  id: string;
  name: string;
  quantity: number;
  kind: "kit" | "item" | "unresolved";
  components: { name: string; quantity: number }[];
};

export function DeactivateForm({
  jobId,
  lines,
}: {
  jobId: string;
  lines: DeactivateLine[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [returns, setReturns] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const l of lines) init[l.id] = to2Dp(l.quantity);
    return init;
  });
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { totalReturn, totalScrap } = useMemo(() => {
    let r = 0;
    let s = 0;
    for (const l of lines) {
      if (l.kind === "unresolved") continue;
      const raw = Number(returns[l.id] ?? 0);
      const ret = Math.max(0, Math.min(l.quantity, isNaN(raw) ? 0 : raw));
      r += ret;
      s += l.quantity - ret;
    }
    return { totalReturn: r, totalScrap: s };
  }, [lines, returns]);

  function setOne(id: string, val: string) {
    setReturns((p) => ({ ...p, [id]: val }));
  }

  function setAll(mode: "return" | "scrap") {
    const next: Record<string, string> = {};
    for (const l of lines) {
      next[l.id] = mode === "return" ? to2Dp(l.quantity) : "0";
    }
    setReturns(next);
  }

  function handleSubmit() {
    setError(null);
    const decisions: DeactivateDecision[] = lines
      .filter((l) => l.kind !== "unresolved")
      .map((l) => {
        const raw = Number(returns[l.id] ?? 0);
        const ret = Math.max(0, Math.min(l.quantity, isNaN(raw) ? 0 : raw));
        return { jobLineItemId: l.id, returnQty: ret };
      });

    startTransition(async () => {
      try {
        await deactivateJob(jobId, decisions, reason.trim() || null);
        router.push(`/job-flow/jobs/${jobId}`);
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to deactivate job.",
        );
      }
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-md border border-rule bg-card p-4 text-sm text-ink-dim">
        For each line, enter how many to{" "}
        <strong className="text-green-300">return</strong> to inventory. The
        rest is{" "}
        <strong className="text-red-300">scrapped</strong> and stays out of
        inventory. For kit lines, the component items are restored based on
        the kit recipe.
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAll("return")}
          className="rounded-md border border-rule bg-canvas px-3 py-1.5 text-xs font-medium text-ink hover:border-brand"
        >
          Return all
        </button>
        <button
          type="button"
          onClick={() => setAll("scrap")}
          className="rounded-md border border-rule bg-canvas px-3 py-1.5 text-xs font-medium text-ink hover:border-brand"
        >
          Scrap all
        </button>
      </div>

      <ul className="space-y-3">
        {lines.map((l) => {
          const total = l.quantity;
          const raw = Number(returns[l.id] ?? 0);
          const ret = isNaN(raw) ? 0 : Math.max(0, Math.min(total, raw));
          const scrap = total - ret;
          const unresolved = l.kind === "unresolved";
          return (
            <li
              key={l.id}
              className="rounded-md border border-rule bg-canvas p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink">{l.name}</div>
                  <div className="text-xs text-ink-dim">
                    {l.kind === "kit"
                      ? "Kit"
                      : l.kind === "item"
                        ? "Item"
                        : "Unresolved — cannot return"}{" "}
                    · Allocated ×{to2Dp(total)}
                  </div>
                </div>
                <div className="flex items-baseline gap-2 text-sm">
                  <label
                    htmlFor={`ret-${l.id}`}
                    className="text-ink-dim whitespace-nowrap"
                  >
                    Return:
                  </label>
                  <input
                    id={`ret-${l.id}`}
                    type="number"
                    min={0}
                    max={total}
                    step="0.01"
                    value={returns[l.id] ?? ""}
                    onChange={(e) => setOne(l.id, e.target.value)}
                    disabled={unresolved}
                    className="w-24 rounded-md border border-rule bg-canvas px-2 py-1 text-right text-sm text-ink tabular-nums focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
                  />
                  <span className="text-xs text-red-300 whitespace-nowrap">
                    Scrap ×{to2Dp(scrap)}
                  </span>
                </div>
              </div>

              {l.kind === "kit" && l.components.length > 0 && (
                <ul className="mt-2 ml-6 space-y-0.5 border-l border-rule pl-3 text-xs text-ink-dim">
                  {l.components.map((c, idx) => (
                    <li
                      key={idx}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="tabular-nums whitespace-nowrap">
                        ×{to2Dp(c.quantity * ret)} returning · ×
                        {to2Dp(c.quantity * scrap)} scrapped
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <section className="rounded-md border border-rule bg-card p-4">
        <label
          htmlFor="reason"
          className="block text-sm font-medium text-ink"
        >
          Reason (optional)
        </label>
        <textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Customer cancelled, weather damage, etc."
          maxLength={500}
          rows={2}
          className="mt-1 block w-full rounded-md border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </section>

      <section className="rounded-md border border-rule bg-card p-4">
        {error && (
          <p className="mb-3 rounded-md border border-red-700/40 bg-red-900/20 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-sm text-ink-dim">
            Total{" "}
            <span className="text-green-300">
              returning ×{to2Dp(totalReturn)}
            </span>{" "}
            ·{" "}
            <span className="text-red-300">
              scrapping ×{to2Dp(totalScrap)}
            </span>
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <Link
              href={`/job-flow/jobs/${jobId}`}
              className="rounded-md border border-rule bg-canvas px-4 py-2 text-sm font-semibold text-ink hover:border-brand"
            >
              Cancel
            </Link>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Deactivating…" : "Deactivate Job"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
