"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CleanupResult } from "@/lib/actions/admin-cleanup";

export type CleanupRow = {
  id: string;
  primary: string;
  secondary?: string | null;
  tertiary?: string | null;
};

type Props = {
  title: string;
  rows: CleanupRow[];
  totalCount: number;
  searchParamName: string;
  initialQuery: string;
  columnHeaders: [string, string, string];
  bulkDeleteAction: (ids: string[]) => Promise<CleanupResult>;
  deleteAllAction: () => Promise<CleanupResult>;
};

export function CleanupSection({
  title,
  rows,
  totalCount,
  searchParamName,
  initialQuery,
  columnHeaders,
  bulkDeleteAction,
  deleteAllAction,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<null | {
    mode: "selected" | "all";
    count: number;
  }>(null);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allOnPageSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAllOnPage() {
    if (allOnPageSelected) {
      const next = new Set(selected);
      rows.forEach((r) => next.delete(r.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      rows.forEach((r) => next.add(r.id));
      setSelected(next);
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function openModal(mode: "selected" | "all") {
    setConfirmText("");
    setError(null);
    setFlash(null);
    setModal({
      mode,
      count: mode === "selected" ? selected.size : totalCount,
    });
  }

  function closeModal() {
    if (isPending) return;
    setModal(null);
    setConfirmText("");
  }

  function runDelete() {
    if (!modal) return;
    if (confirmText !== "DELETE") {
      setError('You must type DELETE exactly to confirm.');
      return;
    }
    setError(null);
    const mode = modal.mode;
    const ids = mode === "selected" ? [...selected] : null;
    startTransition(async () => {
      try {
        const res = ids ? await bulkDeleteAction(ids) : await deleteAllAction();
        setFlash(`Deleted ${res.deleted} ${title.toLowerCase()}.`);
        setSelected(new Set());
        setModal(null);
        setConfirmText("");
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Delete failed. See logs.",
        );
      }
    });
  }

  return (
    <section className="rounded-lg border border-rule bg-card p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-xs text-ink-dim">
            Showing {rows.length} of {totalCount} total. Select rows to delete,
            or use Delete ALL to wipe every {title.toLowerCase().slice(0, -1)} in the database.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => openModal("selected")}
            disabled={selected.size === 0 || isPending}
            className="rounded-md border border-rule bg-canvas px-3 py-2 text-sm font-medium text-ink hover:bg-card/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete selected ({selected.size})
          </button>
          <button
            type="button"
            onClick={() => openModal("all")}
            disabled={totalCount === 0 || isPending}
            className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete ALL ({totalCount})
          </button>
        </div>
      </header>

      {flash && (
        <div className="mt-4 rounded-md border border-green-700 bg-green-900/30 px-3 py-2 text-sm text-green-200">
          {flash}
        </div>
      )}

      <form
        method="get"
        className="mt-4 max-w-md"
        action="/admin/cleanup"
      >
        <input
          type="search"
          name={searchParamName}
          defaultValue={initialQuery}
          placeholder={`Search ${title.toLowerCase()} by name…`}
          className="w-full rounded-md border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </form>

      <div className="mt-4 overflow-hidden rounded-md border border-rule">
        <table className="w-full text-sm">
          <thead className="bg-canvas text-left text-xs uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleAllOnPage}
                  aria-label={`Select all visible ${title.toLowerCase()}`}
                />
              </th>
              <th className="px-3 py-2">{columnHeaders[0]}</th>
              <th className="px-3 py-2">{columnHeaders[1]}</th>
              <th className="px-3 py-2">{columnHeaders[2]}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule bg-card">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center text-sm text-ink-dim"
                >
                  {initialQuery
                    ? `No ${title.toLowerCase()} matched "${initialQuery}".`
                    : `No ${title.toLowerCase()} in the database.`}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className={`text-ink ${selected.has(r.id) ? "bg-brand/10" : ""}`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      aria-label={`Select ${r.primary}`}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{r.primary}</td>
                  <td className="px-3 py-2 text-ink-dim">{r.secondary ?? "—"}</td>
                  <td className="px-3 py-2 text-ink-dim">{r.tertiary ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-lg border border-rule bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-ink">
              {modal.mode === "all"
                ? `Delete ALL ${title.toLowerCase()}?`
                : `Delete ${modal.count} ${title.toLowerCase()}?`}
            </h3>
            <p className="mt-2 text-sm text-ink-dim">
              About to delete <strong className="text-ink">{modal.count}</strong>{" "}
              {title.toLowerCase()}. References on Job line items will be
              nulled out (the rows themselves survive). This cannot be undone.
            </p>
            <p className="mt-4 text-sm text-ink">
              Type{" "}
              <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-xs">
                DELETE
              </code>{" "}
              to confirm:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              className="mt-2 w-full rounded-md border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              disabled={isPending}
            />
            {error && (
              <p className="mt-2 text-sm text-red-400">{error}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                disabled={isPending}
                className="rounded-md border border-rule bg-canvas px-3 py-2 text-sm font-medium text-ink hover:bg-card/40 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runDelete}
                disabled={isPending || confirmText !== "DELETE"}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPending ? "Deleting…" : `Delete ${modal.count}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
