"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InspectionDecision } from "@prisma/client";
import { setInspectionDecision } from "@/lib/actions/inspection";
import { to2Dp } from "@/lib/format";

export type InspectionLine = {
  id: string;
  name: string;
  quantity: number;
  kind: "kit" | "item" | "unresolved";
  components: Array<{
    itemId: string;
    itemName: string;
    quantityPerKit: number;
  }>;
  /** For standalone Item lines, the item's own id (so REPAIRED can pull from it). */
  itemId?: string;
  /** Existing decision if Santa has already chosen one. */
  decision: InspectionDecision | null;
  /** Existing repair quantities, keyed by itemId, if previously saved as REPAIRED. */
  repairQtyByItemId: Record<string, number>;
};

export function InspectionRowControls({ line }: { line: InspectionLine }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showRepair, setShowRepair] = useState(line.decision === "REPAIRED");
  const [error, setError] = useState<string | null>(null);

  // Default repair quantity for a row = full needed quantity (the user can
  // dial it down if only some of the items need replacing).
  function defaultRepairQty(itemId: string): number {
    if (line.repairQtyByItemId[itemId] !== undefined) {
      return line.repairQtyByItemId[itemId];
    }
    if (line.kind === "kit") {
      const c = line.components.find((c) => c.itemId === itemId);
      return c ? Math.ceil(c.quantityPerKit * line.quantity) : 0;
    }
    if (line.kind === "item" && line.itemId === itemId) {
      return Math.ceil(line.quantity);
    }
    return 0;
  }

  const repairTargets =
    line.kind === "kit"
      ? line.components.map((c) => ({ itemId: c.itemId, itemName: c.itemName }))
      : line.kind === "item" && line.itemId
        ? [{ itemId: line.itemId, itemName: line.name }]
        : [];

  const [repairQty, setRepairQty] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const t of repairTargets) {
      init[t.itemId] = to2Dp(defaultRepairQty(t.itemId));
    }
    return init;
  });

  function commit(decision: InspectionDecision) {
    setError(null);
    let repairParts: Array<{ itemId: string; quantity: number }> | undefined;
    if (decision === "REPAIRED") {
      repairParts = repairTargets
        .map((t) => ({
          itemId: t.itemId,
          quantity: Number(repairQty[t.itemId] ?? 0),
        }))
        .filter((d) => d.quantity > 0);
      if (repairParts.length === 0) {
        setError("Enter at least one repair quantity > 0.");
        return;
      }
    }
    startTransition(async () => {
      try {
        await setInspectionDecision(line.id, decision, repairParts);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save decision.");
      }
    });
  }

  function btnClass(target: InspectionDecision, accent: string) {
    const active = line.decision === target;
    if (active) {
      return `rounded-md border px-3 py-1.5 text-xs font-semibold ${accent}`;
    }
    return "rounded-md border border-rule bg-canvas px-3 py-1.5 text-xs font-medium text-ink-dim hover:border-brand hover:text-ink";
  }

  if (line.kind === "unresolved") {
    return (
      <div className="text-xs italic text-ink-dim">
        Unlinked line — can&apos;t be inspected. Re-run Jobber sync to link it
        to an Item or Kit.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setShowRepair(false);
            commit("GOOD");
          }}
          className={btnClass(
            "GOOD",
            "border-green-600 bg-green-600/20 text-green-100 ring-1 ring-green-600/40",
          )}
        >
          Good
        </button>
        <button
          type="button"
          disabled={isPending || repairTargets.length === 0}
          onClick={() => setShowRepair((v) => !v)}
          className={btnClass(
            "REPAIRED",
            "border-yellow-600 bg-yellow-500/20 text-yellow-100 ring-1 ring-yellow-500/40",
          )}
        >
          Repaired
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setShowRepair(false);
            commit("DEAD");
          }}
          className={btnClass(
            "DEAD",
            "border-red-600 bg-red-600/20 text-red-100 ring-1 ring-red-600/40",
          )}
        >
          Dead
        </button>
      </div>

      {showRepair && repairTargets.length > 0 && (
        <div className="ml-6 rounded-md border border-yellow-600/40 bg-yellow-500/5 p-3">
          <p className="text-xs text-yellow-100">
            Pull replacement parts from inventory. Adjust per-component
            quantities below (default = full needed quantity).
          </p>
          <ul className="mt-2 space-y-1">
            {repairTargets.map((t) => (
              <li key={t.itemId} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-ink">{t.itemName}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  value={repairQty[t.itemId] ?? ""}
                  onChange={(e) =>
                    setRepairQty((prev) => ({ ...prev, [t.itemId]: e.target.value }))
                  }
                  onBlur={(e) => {
                    if (e.target.value === "") return;
                    const n = Number(e.target.value);
                    if (!Number.isNaN(n)) {
                      setRepairQty((prev) => ({ ...prev, [t.itemId]: to2Dp(n) }));
                    }
                  }}
                  className="w-24 rounded-md border border-rule bg-canvas px-2 py-1 text-right text-ink tabular-nums focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowRepair(false)}
              disabled={isPending}
              className="rounded-md border border-rule bg-canvas px-3 py-1.5 text-xs font-medium text-ink-dim hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => commit("REPAIRED")}
              disabled={isPending}
              className="rounded-md bg-yellow-600 px-3 py-1.5 text-xs font-medium text-ink hover:bg-yellow-500 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save repair"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
