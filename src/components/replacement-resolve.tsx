"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReplacementResolution } from "@prisma/client";
import {
  resolveReplacement,
  reopenReplacement,
} from "@/lib/actions/replacements";

const RESOLUTIONS: Array<{
  value: ReplacementResolution;
  label: string;
  hint: string;
}> = [
  {
    value: "REPAIR",
    label: "Repair",
    hint: "Fix the existing unit in-house — no inventory change.",
  },
  {
    value: "REPLACE_FROM_STOCK",
    label: "Replace from stock",
    hint: "Pull a replacement from the shared pool.",
  },
  {
    value: "PURCHASE_ORDER",
    label: "Purchase order",
    hint: "Order from a vendor.",
  },
];

export function ResolveControls({
  id,
  current,
  poId,
}: {
  id: string;
  current: ReplacementResolution | null;
  poId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [poInput, setPoInput] = useState(poId ?? "");
  const [error, setError] = useState<string | null>(null);

  function pick(res: ReplacementResolution) {
    setError(null);
    const po =
      res === "PURCHASE_ORDER"
        ? poInput.trim() || null
        : null;
    startTransition(async () => {
      try {
        await resolveReplacement(id, res, po);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to resolve.");
      }
    });
  }

  function reopen() {
    setError(null);
    startTransition(async () => {
      try {
        await reopenReplacement(id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to reopen.");
      }
    });
  }

  if (current) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded border border-green-700/40 bg-green-600/10 px-2 py-0.5 font-medium text-green-200">
          {labelFor(current)}
          {current === "PURCHASE_ORDER" && poId && (
            <span className="ml-1 text-green-200/70">· PO {poId}</span>
          )}
        </span>
        <button
          type="button"
          onClick={reopen}
          disabled={isPending}
          className="text-ink-dim hover:text-brand disabled:cursor-not-allowed"
        >
          Reopen
        </button>
        {error && <span className="text-red-300">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {RESOLUTIONS.map((r) => (
        <button
          key={r.value}
          type="button"
          onClick={() => pick(r.value)}
          disabled={isPending}
          title={r.hint}
          className="rounded-md border border-rule bg-canvas px-2 py-1 font-medium text-ink hover:border-brand disabled:cursor-not-allowed"
        >
          {r.label}
        </button>
      ))}
      <input
        type="text"
        value={poInput}
        onChange={(e) => setPoInput(e.target.value)}
        placeholder="PO #"
        className="w-20 rounded-md border border-rule bg-canvas px-2 py-1 text-xs text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        title="Optional PO number when resolving as Purchase Order"
      />
      {error && <span className="text-red-300">{error}</span>}
    </div>
  );
}

function labelFor(r: ReplacementResolution): string {
  if (r === "REPAIR") return "Repair";
  if (r === "REPLACE_FROM_STOCK") return "Replaced from stock";
  return "Purchase order";
}
