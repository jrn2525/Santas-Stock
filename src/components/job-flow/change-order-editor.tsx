"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  applyChangeOrder,
  type ChangeOrderLineInput,
} from "@/lib/actions/change-order";
import { to2Dp } from "@/lib/format";

export type PickerOption = { id: string; name: string };

export type KitRecipeMap = Record<
  string,
  Array<{ itemId: string; itemName: string; quantityPerKit: number }>
>;

type EditableLine = {
  /** Stable React key (independent of refId so duplicates work) */
  key: string;
  /** id from JobLineItem if this row carried over from before */
  existingId?: string;
  kind: "item" | "kit";
  refId: string;
  refName: string;
  quantity: string; // string for editable state
};

/** A kit line's editable recipe component. Holds the current item +
 *  quantity, plus the original values so we can detect customization. */
type EditableComponent = {
  key: string;
  /** From the kit recipe at load time. null for components added later. */
  originalItemId: string | null;
  /** Absolute quantity at load time (recipeQty * initial lineQty). */
  originalQty: number;
  /** Currently selected item (could differ from original after a swap). */
  itemId: string;
  itemName: string;
  /** Current editable absolute quantity. */
  quantity: string;
};

let nextKey = 0;
const newKey = () => `co-${++nextKey}`;

export function ChangeOrderEditor({
  jobId,
  initialLines,
  items,
  kits,
  kitRecipes,
}: {
  jobId: string;
  initialLines: EditableLine[];
  items: PickerOption[];
  kits: PickerOption[];
  kitRecipes: KitRecipeMap;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lines, setLines] = useState<EditableLine[]>(initialLines);

  // Per-line component state for kit lines. Keyed by line.key.
  const [components, setComponents] = useState<
    Record<string, EditableComponent[]>
  >(() => {
    const init: Record<string, EditableComponent[]> = {};
    for (const l of initialLines) {
      if (l.kind !== "kit") continue;
      const recipe = kitRecipes[l.refId];
      if (!recipe) continue;
      const lineQty = Number(l.quantity);
      init[l.key] = recipe.map((c) => {
        const absQty = c.quantityPerKit * (isNaN(lineQty) ? 0 : lineQty);
        return {
          key: newKey(),
          originalItemId: c.itemId,
          originalQty: absQty,
          itemId: c.itemId,
          itemName: c.itemName,
          quantity: to2Dp(absQty),
        };
      });
    }
    return init;
  });

  const [reason, setReason] = useState("");
  const [pickerKind, setPickerKind] = useState<"item" | "kit">("item");
  const [pickerText, setPickerText] = useState("");
  const [pickerQty, setPickerQty] = useState("1.00");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // A kit line is "customized" if any of its components has been changed
  // (item swapped or quantity edited away from the recipe-cascaded default).
  function isKitCustomized(line: EditableLine): boolean {
    if (line.kind !== "kit") return false;
    const comps = components[line.key];
    if (!comps) return false;
    for (const c of comps) {
      if (c.originalItemId === null) return true; // added by user
      if (c.itemId !== c.originalItemId) return true; // swapped
      if (Number(c.quantity) !== c.originalQty) return true; // qty edited
    }
    return false;
  }

  const initialSerialized = useMemo(
    () =>
      JSON.stringify(
        initialLines.map((l) => ({
          refId: l.refId,
          kind: l.kind,
          qty: l.quantity,
        })),
      ),
    [initialLines],
  );

  const currentSerialized = JSON.stringify(
    lines.map((l) => ({
      refId: l.refId,
      kind: l.kind,
      qty: l.quantity,
      comps:
        l.kind === "kit"
          ? components[l.key]?.map((c) => ({
              i: c.itemId,
              q: c.quantity,
            })) ?? null
          : null,
    })),
  );

  // hasChanges: dirty if top-level lines differ from initial OR any kit
  // has been customized at the component level.
  const hasChanges =
    initialSerialized !==
      JSON.stringify(
        lines.map((l) => ({
          refId: l.refId,
          kind: l.kind,
          qty: l.quantity,
        })),
      ) || lines.some((l) => isKitCustomized(l));
  // Use currentSerialized to keep useMemo trigger consistent (silence lint).
  void currentSerialized;

  const pickerOptions = pickerKind === "item" ? items : kits;
  const pickerMatch = pickerOptions.find(
    (o) => o.name.toLowerCase() === pickerText.toLowerCase().trim(),
  );

  function updateQty(key: string, raw: string) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, quantity: raw } : l)),
    );
  }

  function formatQtyOnBlur(key: string, raw: string) {
    if (raw === "") {
      updateQty(key, "0.00");
      return;
    }
    const n = Number(raw);
    if (!Number.isNaN(n)) updateQty(key, to2Dp(n));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
    setComponents((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function updateComponentItem(
    lineKey: string,
    compKey: string,
    text: string,
  ) {
    const match = items.find(
      (i) => i.name.toLowerCase() === text.toLowerCase().trim(),
    );
    setComponents((prev) => ({
      ...prev,
      [lineKey]: (prev[lineKey] ?? []).map((c) =>
        c.key === compKey
          ? match
            ? { ...c, itemId: match.id, itemName: match.name }
            : { ...c, itemName: text } // not resolved yet; keep text in input
          : c,
      ),
    }));
  }

  function updateComponentQty(
    lineKey: string,
    compKey: string,
    raw: string,
  ) {
    setComponents((prev) => ({
      ...prev,
      [lineKey]: (prev[lineKey] ?? []).map((c) =>
        c.key === compKey ? { ...c, quantity: raw } : c,
      ),
    }));
  }

  function formatComponentQtyOnBlur(
    lineKey: string,
    compKey: string,
    raw: string,
  ) {
    if (raw === "") {
      updateComponentQty(lineKey, compKey, "0.00");
      return;
    }
    const n = Number(raw);
    if (!Number.isNaN(n)) updateComponentQty(lineKey, compKey, to2Dp(n));
  }

  function removeComponent(lineKey: string, compKey: string) {
    setComponents((prev) => ({
      ...prev,
      [lineKey]: (prev[lineKey] ?? []).filter((c) => c.key !== compKey),
    }));
  }

  function addComponent(lineKey: string) {
    setComponents((prev) => ({
      ...prev,
      [lineKey]: [
        ...(prev[lineKey] ?? []),
        {
          key: newKey(),
          originalItemId: null,
          originalQty: 0,
          itemId: "",
          itemName: "",
          quantity: "1.00",
        },
      ],
    }));
  }

  function addLine() {
    if (!pickerMatch) {
      setError(`No ${pickerKind} matches "${pickerText}".`);
      return;
    }
    const qty = Number(pickerQty);
    if (Number.isNaN(qty) || qty <= 0) {
      setError("Quantity must be a positive number.");
      return;
    }
    setError(null);
    const newLineKey = newKey();
    const newLine: EditableLine = {
      key: newLineKey,
      kind: pickerKind,
      refId: pickerMatch.id,
      refName: pickerMatch.name,
      quantity: to2Dp(qty),
    };
    setLines((prev) => [...prev, newLine]);
    if (pickerKind === "kit") {
      const recipe = kitRecipes[pickerMatch.id];
      if (recipe) {
        setComponents((prev) => ({
          ...prev,
          [newLineKey]: recipe.map((c) => {
            const absQty = c.quantityPerKit * qty;
            return {
              key: newKey(),
              originalItemId: c.itemId,
              originalQty: absQty,
              itemId: c.itemId,
              itemName: c.itemName,
              quantity: to2Dp(absQty),
            };
          }),
        }));
      }
    }
    setPickerText("");
    setPickerQty("1.00");
  }

  function handleSave() {
    setError(null);
    setFlash(null);
    const payload: ChangeOrderLineInput[] = [];

    for (const line of lines) {
      if (line.kind === "item") {
        const qty = Number(line.quantity);
        if (qty > 0) {
          payload.push({
            id: line.existingId,
            kind: "item",
            refId: line.refId,
            quantity: qty,
          });
        }
        continue;
      }

      // Kit line
      if (isKitCustomized(line)) {
        // Decompose: emit each component as its own item line. The
        // original kit line's existingId is dropped — the JobLineItem
        // mapping logic in applyChangeOrder will treat this as a kit
        // removal + N item additions.
        const comps = components[line.key] ?? [];
        for (const c of comps) {
          if (!c.itemId) continue; // unresolved picker, skip silently
          const cQty = Number(c.quantity);
          if (cQty > 0) {
            payload.push({
              kind: "item",
              refId: c.itemId,
              quantity: cQty,
            });
          }
        }
      } else {
        const qty = Number(line.quantity);
        if (qty > 0) {
          payload.push({
            id: line.existingId,
            kind: "kit",
            refId: line.refId,
            quantity: qty,
          });
        }
      }
    }

    startTransition(async () => {
      try {
        const res = await applyChangeOrder(jobId, payload, reason || null);
        const parts: string[] = [];
        if (res.added) parts.push(`${res.added} added`);
        if (res.removed) parts.push(`${res.removed} removed`);
        if (res.changed) parts.push(`${res.changed} changed`);
        if (res.shortagesCreated > 0) {
          parts.push(
            `${to2Dp(res.shortagesCreated)} short — job moved to Awaiting Stock`,
          );
        }
        setFlash(
          parts.length === 0
            ? "Change Order saved (no net changes)."
            : `Change Order applied: ${parts.join(", ")}.`,
        );
        router.refresh();
        router.push(`/job-flow/jobs/${jobId}`);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to save change order.",
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-rule bg-card p-5 no-print">
        <label htmlFor="reason" className="block text-sm font-medium text-ink">
          Reason / notes (optional)
        </label>
        <input
          id="reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder='e.g. "Customer added bush wrap" or "Switch to candy cane"'
          className="mt-1 block w-full rounded-md border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          maxLength={500}
        />
      </section>

      <datalist id="co-item-list">
        {items.map((o) => (
          <option key={o.id} value={o.name} />
        ))}
      </datalist>

      <section className="rounded-lg border border-rule bg-card p-5">
        <h2 className="text-lg font-semibold text-ink">Pick list</h2>
        <p className="mt-1 text-xs text-white no-print">
          Edit quantities, swap items inside a kit, remove lines, or add
          new lines below. A kit with edited components saves as
          individual item lines.
        </p>

        <ul className="mt-4 space-y-2">
          {lines.length === 0 ? (
            <li className="rounded-md border border-dashed border-rule bg-canvas p-4 text-center text-sm text-white">
              No lines on this job. Add one below.
            </li>
          ) : (
            lines.map((line) => {
              const lineQty = Number(line.quantity);
              const lineComponents =
                line.kind === "kit" ? (components[line.key] ?? []) : [];
              const customized = isKitCustomized(line);
              return (
                <li
                  key={line.key}
                  className="rounded-md border border-rule bg-canvas p-3"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex-1 truncate">
                      <span className="font-medium text-ink">
                        {line.refName}
                      </span>
                      <span className="ml-2 text-xs uppercase tracking-wider text-white">
                        {line.kind}
                      </span>
                      {customized && (
                        <span
                          className="ml-2 rounded border border-yellow-600/40 bg-yellow-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-yellow-200"
                          title="Components edited — will save as individual item lines"
                        >
                          customized
                        </span>
                      )}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      value={line.quantity}
                      onChange={(e) => updateQty(line.key, e.target.value)}
                      onBlur={(e) =>
                        formatQtyOnBlur(line.key, e.target.value)
                      }
                      title={
                        customized
                          ? "Kit-level qty is ignored when components are customized — edit each component below"
                          : undefined
                      }
                      className="w-28 rounded-md border border-rule bg-canvas px-3 py-1.5 text-right text-sm text-ink tabular-nums focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand no-print"
                    />
                    <span className="hidden text-sm tabular-nums text-ink print:inline">
                      ×{to2Dp(isNaN(lineQty) ? 0 : lineQty)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="text-xs font-medium text-red-300 hover:text-red-200 no-print"
                      title="Remove this line"
                    >
                      Remove
                    </button>
                  </div>

                  {line.kind === "kit" && (
                    <div className="mt-3 ml-4 border-l border-white pl-3">
                      <ul className="space-y-1.5">
                        {lineComponents.map((c) => (
                          <li
                            key={c.key}
                            className="flex flex-wrap items-center gap-2 text-xs text-white"
                          >
                            <input
                              type="text"
                              list="co-item-list"
                              value={c.itemName}
                              onChange={(e) =>
                                updateComponentItem(
                                  line.key,
                                  c.key,
                                  e.target.value,
                                )
                              }
                              placeholder="Type to swap item…"
                              autoComplete="off"
                              className="flex-1 min-w-0 rounded-md border border-rule bg-canvas px-2 py-1 text-xs text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand no-print"
                            />
                            <span className="hidden flex-1 min-w-0 truncate text-xs print:inline">
                              {c.itemName || "(unresolved)"}
                            </span>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min={0}
                              value={c.quantity}
                              onChange={(e) =>
                                updateComponentQty(
                                  line.key,
                                  c.key,
                                  e.target.value,
                                )
                              }
                              onBlur={(e) =>
                                formatComponentQtyOnBlur(
                                  line.key,
                                  c.key,
                                  e.target.value,
                                )
                              }
                              className="w-24 rounded-md border border-rule bg-canvas px-2 py-1 text-right text-xs text-ink tabular-nums focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand no-print"
                            />
                            <span className="hidden text-xs tabular-nums print:inline">
                              ×{to2Dp(Number(c.quantity) || 0)}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeComponent(line.key, c.key)}
                              className="text-[11px] font-medium text-red-300 hover:text-red-200 no-print"
                              title="Remove this component from the kit"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => addComponent(line.key)}
                        className="mt-2 rounded-md border border-dashed border-white bg-canvas px-2 py-1 text-[11px] font-medium text-white hover:border-brand hover:text-brand no-print"
                      >
                        + Add component
                      </button>
                    </div>
                  )}
                </li>
              );
            })
          )}
        </ul>

        <div className="mt-6 rounded-md border border-dashed border-rule bg-canvas p-4 no-print">
          <h3 className="text-sm font-medium text-ink">Add a line</h3>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="picker-kind"
                className="block text-xs font-medium text-white"
              >
                Kind
              </label>
              <select
                id="picker-kind"
                value={pickerKind}
                onChange={(e) => {
                  setPickerKind(e.target.value as "item" | "kit");
                  setPickerText("");
                }}
                className="mt-1 rounded-md border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                <option value="item">Item</option>
                <option value="kit">Kit</option>
              </select>
            </div>
            <div className="min-w-[18rem] flex-1">
              <label
                htmlFor="picker-name"
                className="block text-xs font-medium text-white"
              >
                {pickerKind === "item" ? "Item" : "Kit"}
              </label>
              <input
                id="picker-name"
                type="text"
                list="co-picker-list"
                value={pickerText}
                onChange={(e) => setPickerText(e.target.value)}
                placeholder={`Type to search ${pickerKind}s…`}
                autoComplete="off"
                className="mt-1 block w-full rounded-md border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <datalist id="co-picker-list">
                {pickerOptions.map((o) => (
                  <option key={o.id} value={o.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label
                htmlFor="picker-qty"
                className="block text-xs font-medium text-white"
              >
                Quantity
              </label>
              <input
                id="picker-qty"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                value={pickerQty}
                onChange={(e) => setPickerQty(e.target.value)}
                onBlur={(e) => {
                  if (e.target.value === "") {
                    setPickerQty("1.00");
                    return;
                  }
                  const n = Number(e.target.value);
                  if (!Number.isNaN(n)) setPickerQty(to2Dp(n));
                }}
                className="mt-1 w-28 rounded-md border border-rule bg-canvas px-3 py-1.5 text-right text-sm text-ink tabular-nums focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <button
              type="button"
              onClick={addLine}
              disabled={!pickerMatch}
              title={
                pickerMatch
                  ? "Add this line to the pick list"
                  : `Type a ${pickerKind} name first`
              }
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                pickerMatch
                  ? "border border-brand text-brand hover:bg-brand hover:text-ink"
                  : "border border-white bg-canvas text-white cursor-not-allowed"
              }`}
            >
              + Add line
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-rule bg-card p-5 no-print">
        {flash && (
          <p className="mb-3 rounded-md border border-green-700/40 bg-green-900/20 px-3 py-2 text-sm text-green-200">
            {flash}
          </p>
        )}
        {error && (
          <p className="mb-3 rounded-md border border-red-700/40 bg-red-900/20 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push(`/job-flow/jobs/${jobId}`)}
            disabled={isPending}
            className="rounded-md border border-rule bg-canvas px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || isPending}
            title={
              isPending
                ? "Saving…"
                : hasChanges
                  ? "Apply the change order"
                  : "No changes to save"
            }
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
              hasChanges && !isPending
                ? "bg-brand text-ink hover:bg-brand-hover"
                : "cursor-not-allowed bg-canvas text-white"
            }`}
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </section>
    </div>
  );
}
