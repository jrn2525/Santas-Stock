import type { ReactNode } from "react";
import { to2Dp } from "@/lib/format";

/**
 * Shared hierarchical Pick List renderer.
 *
 * Used everywhere a pick list appears in the Job Flow section:
 * - Pick List card on the job detail page
 * - The full /job-flow/pick-list/[id] page
 * - (future) Awaiting Stock, Inspection, Change Order, Deactivation pages
 *
 * Layout rules (per design):
 * - Kit names un-indented, bold, prominent — they're the "header" for their group
 * - Component items tabbed/indented beneath the kit name, dimmer style
 * - Standalone items (not part of any kit) at the top level, same weight as kit names
 */

export type PickListLine = {
  id: string;
  /** Multiplier on the line. The recipe shown will multiply by this. */
  quantity: number;
  /** "kit" if a kit recipe should be expanded, "item" if standalone, "unresolved" otherwise. */
  kind: "kit" | "item" | "unresolved";
  /** Display name (kit name, item name, or raw fallback). */
  name: string;
  /** Optional note on the line (carries over to print). */
  notes?: string | null;
  /** For kits: the recipe components. Empty for items/unresolved. */
  components?: Array<{
    itemId: string;
    itemName: string;
    quantityPerKit: number;
  }>;
  /** Optional extra UI per row (e.g. status badge during Inspection). */
  rowAccessory?: ReactNode;
  /** Optional extra UI per recipe-component row (e.g. Dead/Repaired/Good buttons). */
  componentAccessory?: (componentItemId: string) => ReactNode;
};

export function PickListView({
  lines,
  emptyMessage,
}: {
  lines: PickListLine[];
  emptyMessage?: string;
}) {
  if (lines.length === 0) {
    return (
      <p className="text-sm text-ink-dim">
        {emptyMessage ?? "No line items on this Job."}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {lines.map((line) => (
        <PickListRow key={line.id} line={line} />
      ))}
    </ul>
  );
}

function PickListRow({ line }: { line: PickListLine }) {
  const isKit = line.kind === "kit";
  const isUnresolved = line.kind === "unresolved";

  return (
    <li className="rounded-md border border-rule bg-canvas p-3 pick-list-row">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div
            className={`font-semibold text-ink ${isKit ? "text-base" : "text-sm"}`}
          >
            {line.name}
          </div>
          {isUnresolved && (
            <div className="mt-0.5 text-xs italic text-ink-dim">
              Unlinked — run Sync from Inventory → Jobber to match by name
            </div>
          )}
          {line.notes && (
            <p className="mt-1 text-xs italic text-ink-dim">{line.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {line.rowAccessory}
          <span className="text-sm font-medium text-ink tabular-nums whitespace-nowrap">
            ×{to2Dp(line.quantity)}
          </span>
        </div>
      </div>

      {isKit && line.components && line.components.length > 0 && (
        <ul className="mt-2 ml-6 space-y-1 border-l border-rule pl-3 text-sm">
          {line.components.map((c) => (
            <li
              key={c.itemId}
              className="flex items-baseline justify-between gap-3 text-ink-dim"
            >
              <span className="truncate">{c.itemName}</span>
              <div className="flex items-center gap-3">
                {line.componentAccessory?.(c.itemId)}
                <span className="tabular-nums whitespace-nowrap">
                  ×{to2Dp(c.quantityPerKit * line.quantity)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Adapter to convert a Prisma JobLineItem (with kit and component item)
 * into the PickListLine shape this component renders. Keeps queries DRY.
 */
export type PrismaJobLineItem = {
  id: string;
  quantity: { toString(): string } | number;
  notes: string | null;
  rawName: string | null;
  item: { name: string } | null;
  kit:
    | {
        name: string;
        items: Array<{
          itemId: string;
          quantity: number;
          item: { name: string };
        }>;
      }
    | null;
};

export function lineItemsToPickListLines(
  lineItems: PrismaJobLineItem[],
): PickListLine[] {
  return lineItems.map((li) => {
    const qty = Number(li.quantity);
    if (li.kit) {
      return {
        id: li.id,
        quantity: qty,
        kind: "kit",
        name: li.kit.name,
        notes: li.notes,
        components: li.kit.items.map((ki) => ({
          itemId: ki.itemId,
          itemName: ki.item.name,
          quantityPerKit: ki.quantity,
        })),
      };
    }
    if (li.item) {
      return {
        id: li.id,
        quantity: qty,
        kind: "item",
        name: li.item.name,
        notes: li.notes,
      };
    }
    return {
      id: li.id,
      quantity: qty,
      kind: "unresolved",
      name: li.rawName ?? "(unnamed)",
      notes: li.notes,
    };
  });
}
