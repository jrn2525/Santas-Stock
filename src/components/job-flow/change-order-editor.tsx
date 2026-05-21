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
  Array<{ itemName: string; quantityPerKit: number }>
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
  const [reason, setReason] = useState("");
  const [pickerKind, setPickerKind] = useState<"item" | "kit">("item");
  const [pickerText, setPickerText] = useState("");
  const [pickerQty, setPickerQty] = useState("1.00");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const initialSerialized = useMemo(
    () => JSON.stringify(initialLines.map((l) => ({ refId: l.refId, kind: l.kind, qty: l.quantity }))),
    [initialLines],
  );
  const currentSerialized = JSON.stringify(
    lines.map((l) => ({ refId: l.refId, kind: l.kind, qty: l.quantity })),
  );
  const hasChanges = initialSerialized !== currentSerialized;

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
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        kind: pickerKind,
        refId: pickerMatch.id,
        refName: pickerMatch.name,
        quantity: to2Dp(qty),
      },
    ]);
    setPickerText("");
    setPickerQty("1.00");
  }

  function handleSave() {
    setError(null);
    setFlash(null);
    const payload: ChangeOrderLineInput[] = lines
      .map((l) => ({
        id: l.existingId,
        kind: l.kind,
        refId: l.refId,
        quantity: Number(l.quantity),
      }))
      .filter((l) => l.quantity > 0);

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
        setError(e instanceof Error ? e.message : "Failed to save change order.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-rule bg-card p-5">
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

      <section className="rounded-lg border border-rule bg-card p-5">
        <h2 className="text-lg font-semibold text-ink">Pick list</h2>
        <p className="mt-1 text-xs text-white">
          Edit quantities, remove lines, or add new lines below. Inventory
          adjusts automatically when you save.
        </p>

        <ul className="mt-4 space-y-2">
          {lines.length === 0 ? (
            <li className="rounded-md border border-dashed border-rule bg-canvas p-4 text-center text-sm text-white">
              No lines on this job. Add one below.
            </li>
          ) : (
            lines.map((line) => {
              const recipe = line.kind === "kit" ? kitRecipes[line.refId] : null;
              const lineQty = Number(line.quantity);
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
                      className="w-28 rounded-md border border-rule bg-canvas px-3 py-1.5 text-right text-sm text-ink tabular-nums focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="text-xs font-medium text-red-300 hover:text-red-200"
                      title="Remove this line"
                    >
                      Remove
                    </button>
                  </div>
                  {recipe && recipe.length > 0 && (
                    <ul className="mt-2 ml-4 space-y-0.5 border-l border-white pl-3 text-xs text-white">
                      {recipe.map((c, i) => (
                        <li
                          key={i}
                          className="flex items-baseline justify-between gap-3"
                        >
                          <span className="truncate">{c.itemName}</span>
                          <span className="tabular-nums whitespace-nowrap">
                            ×
                            {to2Dp(
                              c.quantityPerKit *
                                (isNaN(lineQty) ? 0 : lineQty),
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })
          )}
        </ul>

        <div className="mt-6 rounded-md border border-dashed border-rule bg-canvas p-4">
          <h3 className="text-sm font-medium text-ink">Add a line</h3>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="picker-kind" className="block text-xs font-medium text-white">
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
              <label htmlFor="picker-name" className="block text-xs font-medium text-white">
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
              <label htmlFor="picker-qty" className="block text-xs font-medium text-white">
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

      <section className="rounded-lg border border-rule bg-card p-5">
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
