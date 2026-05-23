"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { InspectionDecision } from "@prisma/client";
import {
  saveInspectionDecisions,
  type InspectionLineInput,
} from "@/lib/actions/inspection";
import { to2Dp } from "@/lib/format";

export type InspectionComponent = {
  itemId: string;
  itemName: string;
  quantityPerKit: number;
  /** Existing decision for this component, or null. */
  decision: InspectionDecision | null;
  /** Existing repair quantity (if any). */
  repairQty: number;
};

export type InspectionLine = {
  id: string;
  name: string;
  quantity: number;
  kind: "kit" | "item" | "unresolved";
  /** Only set for kind === "item". */
  itemId?: string;
  /** Only set for kind === "kit". */
  components: InspectionComponent[];
  /** Only set for kind === "item": the existing line decision. */
  itemDecision: InspectionDecision | null;
  /** Only set for kind === "item": the existing repair quantity. */
  itemRepairQty: number;
};

type DecisionState = {
  decision: InspectionDecision | null;
  repairQty: string;
};

type LineState = {
  // For kind === "item": single decision
  itemState?: DecisionState;
  // For kind === "kit": one decision per component, keyed by componentItemId
  componentStates?: Record<string, DecisionState>;
};

function defaultDecision(d: InspectionDecision | null): DecisionState {
  return { decision: d, repairQty: "" };
}

export function InspectionForm({
  jobId,
  lines,
}: {
  jobId: string;
  lines: InspectionLine[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [state, setState] = useState<Record<string, LineState>>(() => {
    const init: Record<string, LineState> = {};
    for (const l of lines) {
      if (l.kind === "item") {
        init[l.id] = {
          itemState: {
            decision: l.itemDecision,
            // Default repair qty to 1, not the full line quantity.
            // Most repairs touch a few units, not the whole line; if
            // the user needs more they can type the actual number.
            repairQty: l.itemRepairQty
              ? to2Dp(l.itemRepairQty)
              : "1",
          },
        };
      } else if (l.kind === "kit") {
        const comp: Record<string, DecisionState> = {};
        for (const c of l.components) {
          comp[c.itemId] = {
            decision: c.decision,
            // Same default-to-1 reasoning as item lines above.
            repairQty: c.repairQty ? to2Dp(c.repairQty) : "1",
          };
        }
        init[l.id] = { componentStates: comp };
      } else {
        init[l.id] = {};
      }
    }
    return init;
  });

  const { decided, total } = useMemo(() => {
    let d = 0;
    let t = 0;
    for (const l of lines) {
      if (l.kind === "unresolved") continue;
      t++;
      const s = state[l.id];
      if (l.kind === "item" && s?.itemState?.decision) d++;
      if (
        l.kind === "kit" &&
        s?.componentStates &&
        l.components.length > 0 &&
        l.components.every((c) => s.componentStates![c.itemId]?.decision)
      )
        d++;
    }
    return { decided: d, total: t };
  }, [lines, state]);

  function setItemDecision(
    lineId: string,
    decision: InspectionDecision | null,
  ) {
    setState((p) => ({
      ...p,
      [lineId]: {
        ...p[lineId],
        itemState: {
          decision,
          repairQty: p[lineId]?.itemState?.repairQty ?? "",
        },
      },
    }));
  }

  function setItemRepairQty(lineId: string, raw: string) {
    setState((p) => ({
      ...p,
      [lineId]: {
        ...p[lineId],
        itemState: {
          decision: p[lineId]?.itemState?.decision ?? null,
          repairQty: raw,
        },
      },
    }));
  }

  function setComponentDecision(
    lineId: string,
    componentItemId: string,
    decision: InspectionDecision | null,
  ) {
    setState((p) => ({
      ...p,
      [lineId]: {
        ...p[lineId],
        componentStates: {
          ...p[lineId]?.componentStates,
          [componentItemId]: {
            decision,
            repairQty:
              p[lineId]?.componentStates?.[componentItemId]?.repairQty ?? "",
          },
        },
      },
    }));
  }

  function setComponentRepairQty(
    lineId: string,
    componentItemId: string,
    raw: string,
  ) {
    setState((p) => ({
      ...p,
      [lineId]: {
        ...p[lineId],
        componentStates: {
          ...p[lineId]?.componentStates,
          [componentItemId]: {
            decision:
              p[lineId]?.componentStates?.[componentItemId]?.decision ?? null,
            repairQty: raw,
          },
        },
      },
    }));
  }

  const handleSave = useCallback(() => {
    setError(null);
    const inputs: InspectionLineInput[] = [];
    for (const l of lines) {
      if (l.kind === "unresolved") continue;
      if (l.kind === "item") {
        if (!l.itemId) continue;
        const s = state[l.id]?.itemState ?? defaultDecision(null);
        const rq = Number(s.repairQty);
        inputs.push({
          jobLineItemId: l.id,
          kind: "item",
          itemId: l.itemId,
          decision: s.decision,
          repairQty:
            s.decision === "REPAIRED" && !isNaN(rq) && rq > 0 ? rq : undefined,
        });
      } else {
        const comps = state[l.id]?.componentStates ?? {};
        inputs.push({
          jobLineItemId: l.id,
          kind: "kit",
          components: l.components.map((c) => {
            const s = comps[c.itemId] ?? defaultDecision(null);
            const rq = Number(s.repairQty);
            return {
              componentItemId: c.itemId,
              decision: s.decision,
              repairQty:
                s.decision === "REPAIRED" && !isNaN(rq) && rq > 0
                  ? rq
                  : undefined,
            };
          }),
        });
      }
    }

    startTransition(async () => {
      try {
        await saveInspectionDecisions(jobId, inputs);
        router.push(`/job-flow/jobs/${jobId}`);
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to save inspection.",
        );
      }
    });
  }, [jobId, lines, router, startTransition, state]);

  // Find the index of the first line where at least one decision is
  // still missing — used by the "Jump to next" button. Returns -1 if
  // everything is decided.
  const nextUndecidedIndex = useMemo(() => {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.kind === "unresolved") continue;
      const s = state[l.id];
      if (l.kind === "item") {
        if (!s?.itemState?.decision) return i;
      } else if (l.kind === "kit") {
        for (const c of l.components) {
          if (!s?.componentStates?.[c.itemId]?.decision) return i;
        }
      }
    }
    return -1;
  }, [lines, state]);

  function jumpToNext() {
    if (nextUndecidedIndex < 0) return;
    const el = document.getElementById(
      `inspection-line-${lines[nextUndecidedIndex].id}`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // Keyboard shortcuts:
  //  - Cmd/Ctrl+S: save inspection (preventDefault so the browser
  //    doesn't pop its own Save dialog).
  //  - Esc: navigate back to the job page (Cancel equivalent).
  //  - Cmd/Ctrl+J: jump to the next undecided line.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!isPending) handleSave();
        return;
      }
      if (meta && e.key.toLowerCase() === "j") {
        e.preventDefault();
        jumpToNext();
        return;
      }
      if (e.key === "Escape") {
        if (!isPending) router.push(`/job-flow/jobs/${jobId}`);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // jumpToNext is stable enough not to need in deps; handleSave is
    // already a useCallback so it covers its own deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSave, isPending, jobId, router, nextUndecidedIndex]);

  return (
    <>
      <div className="mt-1 flex flex-wrap items-baseline gap-3 text-sm">
        <p className="text-white">
          {decided} of {total} lines fully inspected
        </p>
        {nextUndecidedIndex >= 0 && (
          <button
            type="button"
            onClick={jumpToNext}
            className="rounded-md border border-rule bg-canvas px-3 py-1 text-xs font-medium text-ink hover:border-brand no-print"
            title="Scroll to the next line that hasn't been decided yet (Ctrl/Cmd+J)"
          >
            Jump to next undecided →
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-ink-dim no-print">
        Shortcuts: <kbd className="text-ink">Ctrl/Cmd+S</kbd> save ·{" "}
        <kbd className="text-ink">Ctrl/Cmd+J</kbd> jump to next ·{" "}
        <kbd className="text-ink">Esc</kbd> cancel
      </p>

      <section className="mt-6 rounded-md border border-rule bg-card p-4 text-sm text-white no-print">
        Walk each line and mark{" "}
        <strong className="text-green-300">Good</strong> (no inventory
        change), <strong className="text-yellow-300">Repaired</strong> (pull
        replacement parts from inventory and allocate to the kit), or{" "}
        <strong className="text-red-300">Dead</strong> (entire line scrapped
        — inventory deducted permanently). Click Save at the bottom when
        done.
      </section>

      <ul className="mt-6 space-y-3">
        {lines.map((line) => (
          <LineRow
            key={line.id}
            line={line}
            lineState={state[line.id] ?? {}}
            onItemDecision={(d) => setItemDecision(line.id, d)}
            onItemRepairQty={(raw) => setItemRepairQty(line.id, raw)}
            onComponentDecision={(cid, d) =>
              setComponentDecision(line.id, cid, d)
            }
            onComponentRepairQty={(cid, raw) =>
              setComponentRepairQty(line.id, cid, raw)
            }
          />
        ))}
      </ul>

      <section className="mt-6 rounded-md border border-rule bg-card p-4 no-print">
        {error && (
          <p className="mb-3 rounded-md border border-red-700/40 bg-red-900/20 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Link
            href={`/job-flow/jobs/${jobId}`}
            className="rounded-md border border-rule bg-canvas px-4 py-2 text-sm font-semibold text-white hover:border-brand"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-hover disabled:cursor-not-allowed"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </section>
    </>
  );
}

function LineRow({
  line,
  lineState,
  onItemDecision,
  onItemRepairQty,
  onComponentDecision,
  onComponentRepairQty,
}: {
  line: InspectionLine;
  lineState: LineState;
  onItemDecision: (d: InspectionDecision | null) => void;
  onItemRepairQty: (raw: string) => void;
  onComponentDecision: (
    componentItemId: string,
    d: InspectionDecision | null,
  ) => void;
  onComponentRepairQty: (componentItemId: string, raw: string) => void;
}) {
  if (line.kind === "unresolved") {
    return (
      <li
        id={`inspection-line-${line.id}`}
        className="rounded-md border border-rule bg-canvas p-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-white">{line.name}</div>
            <div className="text-xs italic text-white">
              Unlinked line — can&apos;t be inspected. Re-run Jobber sync to
              link it to an Item or Kit.
            </div>
          </div>
          <span className="text-sm font-medium text-white tabular-nums whitespace-nowrap">
            ×{to2Dp(line.quantity)}
          </span>
        </div>
      </li>
    );
  }

  return (
    <li
      id={`inspection-line-${line.id}`}
      className="rounded-md border border-rule bg-canvas p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-white">{line.name}</div>
          <div className="text-xs text-white">
            {line.kind === "kit" ? "Kit" : "Item"}
          </div>
        </div>
        <span className="text-sm font-medium text-white tabular-nums whitespace-nowrap">
          ×{to2Dp(line.quantity)}
        </span>
      </div>

      {line.kind === "item" && line.itemId && (
        <div className="mt-3">
          <DecisionRow
            current={lineState.itemState?.decision ?? null}
            onChoose={onItemDecision}
          />
          {lineState.itemState?.decision === "REPAIRED" && (
            <RepairInput
              label={line.name}
              value={lineState.itemState.repairQty}
              onChange={onItemRepairQty}
            />
          )}
        </div>
      )}

      {line.kind === "kit" && line.components.length > 0 && (
        <ul className="mt-3 space-y-2 border-l border-white pl-3">
          {line.components.map((c) => {
            const cs =
              lineState.componentStates?.[c.itemId] ?? defaultDecision(null);
            return (
              <li
                key={c.itemId}
                className="rounded-md border border-rule bg-canvas p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white">
                      {c.itemName}
                    </div>
                  </div>
                  <span className="text-xs text-white tabular-nums whitespace-nowrap">
                    ×{to2Dp(c.quantityPerKit * line.quantity)}
                  </span>
                </div>
                <div className="mt-2">
                  <DecisionRow
                    current={cs.decision}
                    onChoose={(d) => onComponentDecision(c.itemId, d)}
                  />
                  {cs.decision === "REPAIRED" && (
                    <RepairInput
                      label={c.itemName}
                      value={cs.repairQty}
                      onChange={(raw) => onComponentRepairQty(c.itemId, raw)}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function DecisionRow({
  current,
  onChoose,
}: {
  current: InspectionDecision | null;
  onChoose: (d: InspectionDecision | null) => void;
}) {
  function btn(d: InspectionDecision, label: string, activeClasses: string) {
    const active = current === d;
    return (
      <button
        type="button"
        onClick={() => onChoose(active ? null : d)}
        className={
          active
            ? `rounded-md border px-3 py-1.5 text-xs font-semibold ${activeClasses}`
            : "rounded-md border border-white bg-canvas px-3 py-1.5 text-xs font-medium text-white hover:border-brand"
        }
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 no-print">
      {btn(
        "GOOD",
        "Good",
        "border-green-600 bg-green-600/20 text-green-100 ring-1 ring-green-600/40",
      )}
      {btn(
        "REPAIRED",
        "Repaired",
        "border-yellow-600 bg-yellow-500/20 text-yellow-100 ring-1 ring-yellow-500/40",
      )}
      {btn(
        "DEAD",
        "Dead",
        "border-red-600 bg-red-600/20 text-red-100 ring-1 ring-red-600/40",
      )}
      <span className="hidden text-xs font-medium text-white print:inline">
        {current ? `Marked: ${labelOf(current)}` : "Not inspected"}
      </span>
    </div>
  );
}

function RepairInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (raw: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-yellow-600/40 bg-yellow-500/5 p-2 text-xs">
      <span className="text-yellow-100">
        Pull replacement {label}:
      </span>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          if (e.target.value === "") return;
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(to2Dp(n));
        }}
        className="w-24 rounded-md border border-rule bg-canvas px-2 py-1 text-right text-white tabular-nums focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
    </div>
  );
}

function labelOf(d: InspectionDecision): string {
  if (d === "GOOD") return "Good";
  if (d === "REPAIRED") return "Repaired";
  return "Dead";
}
