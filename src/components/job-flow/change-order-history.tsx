import type { JobStage } from "@prisma/client";
import { STAGE_LABELS } from "@/lib/job-flow";
import { to2Dp } from "@/lib/format";

type DiffLine = { name: string; kind: "item" | "kit"; quantity: number };
type DiffChanged = {
  name: string;
  kind: "item" | "kit";
  fromQty: number;
  toQty: number;
};
type DiffInventory = { itemName: string; change: number };

type Diff = {
  added?: DiffLine[];
  removed?: DiffLine[];
  changed?: DiffChanged[];
  inventoryDeltas?: DiffInventory[];
};

export function ChangeOrderHistory({
  entries,
}: {
  entries: Array<{
    id: string;
    atStage: JobStage;
    reason: string | null;
    createdAt: string;
    createdByName: string | null;
    diff: unknown;
  }>;
}) {
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <section className="rounded-lg border border-rule bg-card p-6 print-block">
      <h2 className="text-lg font-semibold text-ink">Change Order History</h2>
      <p className="mt-1 text-sm text-ink-dim">
        Every change made to this job&apos;s pick list, with the stage it
        happened at and what changed.
      </p>

      <ul className="mt-4 space-y-3">
        {entries.map((e) => {
          const d = (e.diff ?? {}) as Diff;
          const added = d.added ?? [];
          const removed = d.removed ?? [];
          const changed = d.changed ?? [];
          const inv = d.inventoryDeltas ?? [];
          const empty =
            added.length === 0 &&
            removed.length === 0 &&
            changed.length === 0;
          return (
            <li
              key={e.id}
              className="rounded-md border border-rule bg-canvas p-4"
            >
              <header className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="text-sm text-ink">
                  {dateFmt.format(new Date(e.createdAt))}
                  <span className="ml-2 text-xs text-ink-dim">
                    at {STAGE_LABELS[e.atStage]}
                    {e.createdByName && ` · by ${e.createdByName}`}
                  </span>
                </div>
              </header>

              {e.reason && (
                <p className="mt-1 text-sm italic text-ink-dim">
                  &ldquo;{e.reason}&rdquo;
                </p>
              )}

              {empty ? (
                <p className="mt-2 text-xs text-ink-dim">
                  No net changes recorded.
                </p>
              ) : (
                <div className="mt-2 space-y-1 text-xs">
                  {added.map((l, i) => (
                    <div key={`a${i}`} className="text-green-300">
                      + Added {l.name} ({l.kind}) ×{to2Dp(l.quantity)}
                    </div>
                  ))}
                  {removed.map((l, i) => (
                    <div key={`r${i}`} className="text-red-300">
                      − Removed {l.name} ({l.kind}) ×{to2Dp(l.quantity)}
                    </div>
                  ))}
                  {changed.map((l, i) => (
                    <div key={`c${i}`} className="text-yellow-200">
                      Δ Changed {l.name} ({l.kind}) ×{to2Dp(l.fromQty)} → ×
                      {to2Dp(l.toQty)}
                    </div>
                  ))}
                </div>
              )}

              {inv.length > 0 && (
                <div className="mt-2 text-xs text-ink-dim">
                  Inventory impact:{" "}
                  {inv
                    .map(
                      (d) =>
                        `${d.itemName} ${d.change < 0 ? "+" : "−"}${to2Dp(
                          Math.abs(d.change),
                        )}`,
                    )
                    .join(", ")}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
