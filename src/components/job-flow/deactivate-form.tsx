"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  deactivateJob,
  type DeactivateDecision,
} from "@/lib/actions/deactivate";
import { to2Dp } from "@/lib/format";

export type DeactivateComponent = {
  itemId: string;
  name: string;
  /** Recipe quantity per kit. Allocated total per kit line = this × lineQty. */
  quantityPerKit: number;
};

export type DeactivateLine = {
  id: string;
  name: string;
  quantity: number;
  kind: "kit" | "item" | "unresolved";
  /** Only set when kind === "item". */
  itemId?: string;
  /** Only set when kind === "kit". */
  components: DeactivateComponent[];
};

type LineState = {
  // For kind === "item": single return qty
  itemReturn?: string;
  // For kind === "kit": one return qty per component, keyed by itemId
  componentReturns?: Record<string, string>;
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
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Default each input to "Return all"
  const [state, setState] = useState<Record<string, LineState>>(() => {
    const init: Record<string, LineState> = {};
    for (const l of lines) {
      if (l.kind === "item") {
        init[l.id] = { itemReturn: to2Dp(l.quantity) };
      } else if (l.kind === "kit") {
        const comp: Record<string, string> = {};
        for (const c of l.components) {
          comp[c.itemId] = to2Dp(c.quantityPerKit * l.quantity);
        }
        init[l.id] = { componentReturns: comp };
      } else {
        init[l.id] = {};
      }
    }
    return init;
  });

  const { totalReturn, totalScrap } = useMemo(() => {
    let r = 0;
    let s = 0;
    for (const l of lines) {
      if (l.kind === "unresolved") continue;
      if (l.kind === "item") {
        const ret = parseRet(state[l.id]?.itemReturn, l.quantity);
        r += ret;
        s += l.quantity - ret;
      } else {
        for (const c of l.components) {
          const allocated = Math.ceil(c.quantityPerKit * l.quantity);
          const ret = parseRet(
            state[l.id]?.componentReturns?.[c.itemId],
            allocated,
          );
          r += ret;
          s += allocated - ret;
        }
      }
    }
    return { totalReturn: r, totalScrap: s };
  }, [lines, state]);

  function setItemReturn(lineId: string, raw: string) {
    setState((p) => ({
      ...p,
      [lineId]: { ...p[lineId], itemReturn: raw },
    }));
  }

  function setComponentReturn(
    lineId: string,
    componentItemId: string,
    raw: string,
  ) {
    setState((p) => ({
      ...p,
      [lineId]: {
        ...p[lineId],
        componentReturns: {
          ...p[lineId]?.componentReturns,
          [componentItemId]: raw,
        },
      },
    }));
  }

  function setAll(mode: "return" | "scrap") {
    const next: Record<string, LineState> = {};
    for (const l of lines) {
      if (l.kind === "item") {
        next[l.id] = {
          itemReturn: mode === "return" ? to2Dp(l.quantity) : "0",
        };
      } else if (l.kind === "kit") {
        const comp: Record<string, string> = {};
        for (const c of l.components) {
          comp[c.itemId] =
            mode === "return" ? to2Dp(c.quantityPerKit * l.quantity) : "0";
        }
        next[l.id] = { componentReturns: comp };
      } else {
        next[l.id] = {};
      }
    }
    setState(next);
  }

  function handleSubmit() {
    setError(null);
    const decisions: DeactivateDecision[] = [];

    for (const l of lines) {
      if (l.kind === "unresolved") continue;
      if (l.kind === "item") {
        if (!l.itemId) continue;
        const ret = parseRet(state[l.id]?.itemReturn, l.quantity);
        decisions.push({
          jobLineItemId: l.id,
          kind: "item",
          itemId: l.itemId,
          returnQty: ret,
        });
      } else {
        const comps = l.components.map((c) => {
          const allocated = Math.ceil(c.quantityPerKit * l.quantity);
          const ret = parseRet(
            state[l.id]?.componentReturns?.[c.itemId],
            allocated,
          );
          return { componentItemId: c.itemId, returnQty: ret };
        });
        decisions.push({
          jobLineItemId: l.id,
          kind: "kit",
          components: comps,
        });
      }
    }

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
      <section className="rounded-md border border-rule bg-card p-4 text-sm text-white no-print">
        For each component, enter how many units to{" "}
        <strong className="text-green-300">return</strong> to inventory.
        The rest is{" "}
        <strong className="text-red-300">scrapped</strong> and stays out
        of inventory. Kit components are listed individually so you can
        split a kit&apos;s contents — return the usable parts, scrap the
        rest.
      </section>

      <div className="flex flex-wrap gap-2 no-print">
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
        {lines.map((l) => (
          <LineRow
            key={l.id}
            line={l}
            lineState={state[l.id] ?? {}}
            onItemReturn={(raw) => setItemReturn(l.id, raw)}
            onComponentReturn={(cid, raw) =>
              setComponentReturn(l.id, cid, raw)
            }
          />
        ))}
      </ul>

      <section className="rounded-md border border-rule bg-card p-4 no-print">
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

      {/* Print-only summary of the reason text, when the user has typed
          something. Hidden on screen since the editable textarea above
          already shows the value. */}
      {reason.trim().length > 0 && (
        <section className="hidden rounded-md border border-rule p-4 print:block">
          <div className="text-xs uppercase tracking-wider">Reason</div>
          <p className="mt-1 whitespace-pre-line text-sm">{reason}</p>
        </section>
      )}

      <section className="rounded-md border border-rule bg-card p-4">
        {error && (
          <p className="mb-3 rounded-md border border-red-700/40 bg-red-900/20 px-3 py-2 text-sm text-red-200 no-print">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-sm text-white">
            Total{" "}
            <span className="text-green-300">
              returning ×{to2Dp(totalReturn)}
            </span>{" "}
            ·{" "}
            <span className="text-red-300">
              scrapping ×{to2Dp(totalScrap)}
            </span>
          </p>
          <div className="flex flex-wrap justify-end gap-3 no-print">
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
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-hover disabled:cursor-not-allowed"
            >
              {isPending ? "Deactivating…" : "Deactivate Job"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function LineRow({
  line,
  lineState,
  onItemReturn,
  onComponentReturn,
}: {
  line: DeactivateLine;
  lineState: LineState;
  onItemReturn: (raw: string) => void;
  onComponentReturn: (componentItemId: string, raw: string) => void;
}) {
  if (line.kind === "unresolved") {
    return (
      <li className="rounded-md border border-rule bg-canvas p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-white">{line.name}</div>
            <div className="text-xs italic text-white">
              Unresolved line — cannot return or scrap.
            </div>
          </div>
          <span className="text-sm font-medium text-white tabular-nums whitespace-nowrap">
            ×{to2Dp(line.quantity)}
          </span>
        </div>
      </li>
    );
  }

  if (line.kind === "item") {
    const ret = parseRet(lineState.itemReturn, line.quantity);
    const scrap = line.quantity - ret;
    return (
      <li className="rounded-md border border-rule bg-canvas p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-white">{line.name}</div>
            <div className="text-xs text-white">
              Item · Allocated ×{to2Dp(line.quantity)}
            </div>
          </div>
          <div className="flex items-baseline gap-2 text-sm">
            <label
              htmlFor={`ret-${line.id}`}
              className="text-white whitespace-nowrap no-print"
            >
              Return:
            </label>
            <input
              id={`ret-${line.id}`}
              type="number"
              min={0}
              max={line.quantity}
              step="0.01"
              value={lineState.itemReturn ?? ""}
              onChange={(e) => onItemReturn(e.target.value)}
              className="w-24 rounded-md border border-rule bg-canvas px-2 py-1 text-right text-sm text-ink tabular-nums focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand no-print"
            />
            <span className="hidden text-xs text-green-300 whitespace-nowrap print:inline">
              Return ×{to2Dp(ret)}
            </span>
            <span className="text-xs text-red-300 whitespace-nowrap">
              Scrap ×{to2Dp(scrap)}
            </span>
          </div>
        </div>
      </li>
    );
  }

  // Kit
  return (
    <li className="rounded-md border border-rule bg-canvas p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-white">{line.name}</div>
          <div className="text-xs text-white">
            Kit · {to2Dp(line.quantity)} kit
            {line.quantity === 1 ? "" : "s"} allocated
          </div>
        </div>
        <span className="text-sm font-medium text-white tabular-nums whitespace-nowrap">
          ×{to2Dp(line.quantity)}
        </span>
      </div>

      {line.components.length > 0 && (
        <ul className="mt-3 space-y-2 border-l border-white pl-3">
          {line.components.map((c) => {
            const allocated = Math.ceil(c.quantityPerKit * line.quantity);
            const ret = parseRet(
              lineState.componentReturns?.[c.itemId],
              allocated,
            );
            const scrap = allocated - ret;
            return (
              <li
                key={c.itemId}
                className="rounded-md border border-rule bg-canvas p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white">
                      {c.name}
                    </div>
                    <div className="text-xs text-white">
                      Allocated ×{to2Dp(allocated)}
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2 text-sm">
                    <label
                      htmlFor={`ret-${line.id}-${c.itemId}`}
                      className="text-white whitespace-nowrap no-print"
                    >
                      Return:
                    </label>
                    <input
                      id={`ret-${line.id}-${c.itemId}`}
                      type="number"
                      min={0}
                      max={allocated}
                      step="0.01"
                      value={
                        lineState.componentReturns?.[c.itemId] ?? ""
                      }
                      onChange={(e) =>
                        onComponentReturn(c.itemId, e.target.value)
                      }
                      className="w-24 rounded-md border border-rule bg-canvas px-2 py-1 text-right text-sm text-ink tabular-nums focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand no-print"
                    />
                    <span className="hidden text-xs text-green-300 whitespace-nowrap print:inline">
                      Return ×{to2Dp(ret)}
                    </span>
                    <span className="text-xs text-red-300 whitespace-nowrap">
                      Scrap ×{to2Dp(scrap)}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function parseRet(raw: string | undefined, max: number): number {
  const n = Number(raw ?? 0);
  if (isNaN(n) || n < 0) return 0;
  return Math.min(max, n);
}
