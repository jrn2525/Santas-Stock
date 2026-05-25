"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteUser } from "@/lib/actions/users";

type Stage = "idle" | "confirm" | "type";

/**
 * Two-step safety prompt that wraps the destructive deleteUser action,
 * mirroring the Reset Job button:
 *
 *  1. Click Delete user -> "Are you sure?" modal with OK / Cancel.
 *  2. OK advances to a second modal: type the word DELETE (capitals) to
 *     confirm. The Delete button is disabled until the input matches.
 *  3. On success, navigate back to the user list. Guard failures (last
 *     admin, self-delete) surface inline.
 */
export function DeleteUserButton({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function open() {
    setError(null);
    setTyped("");
    setStage("confirm");
  }

  function close() {
    if (isPending) return;
    setStage("idle");
    setTyped("");
    setError(null);
  }

  function run() {
    if (typed !== "DELETE") return;
    setError(null);
    startTransition(async () => {
      const result = await deleteUser(userId, "DELETE");
      if (result.ok) {
        router.push("/admin/users");
        router.refresh();
      } else {
        setError(result.error ?? "Failed to delete the user.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="rounded-md border border-red-700/60 bg-red-900/10 px-3 py-2 text-sm font-medium text-red-200 hover:border-red-500 hover:bg-red-900/30"
        title="Permanently delete this user"
      >
        Delete user
      </button>

      {stage !== "idle" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-lg border border-rule bg-canvas p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {stage === "confirm" && (
              <>
                <h2 className="text-lg font-semibold text-ink">
                  Delete this user?
                </h2>
                <p className="mt-2 text-sm text-white">
                  You are about to permanently delete{" "}
                  <strong>{userEmail}</strong>. They will no longer be able to
                  sign in. Their past activity stays in the records but is no
                  longer attributed to them.
                </p>
                <p className="mt-2 text-sm text-yellow-200">
                  This cannot be undone.
                </p>
                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-md border border-rule bg-canvas px-4 py-2 text-sm font-semibold text-ink hover:border-brand"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setStage("type")}
                    className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-hover"
                  >
                    OK
                  </button>
                </div>
              </>
            )}

            {stage === "type" && (
              <>
                <h2 className="text-lg font-semibold text-ink">
                  Type DELETE to confirm
                </h2>
                <p className="mt-2 text-sm text-white">
                  To finish deleting <strong>{userEmail}</strong>, type{" "}
                  <strong className="font-mono text-red-200">DELETE</strong>{" "}
                  (capital letters) in the box below.
                </p>
                <input
                  type="text"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoFocus
                  placeholder="DELETE"
                  className="mt-4 block w-full rounded-md border border-rule bg-card px-3 py-2 font-mono text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  disabled={isPending}
                />
                {error && (
                  <p className="mt-3 rounded-md border border-red-700/40 bg-red-900/20 px-3 py-2 text-sm text-red-200">
                    {error}
                  </p>
                )}
                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={close}
                    disabled={isPending}
                    className="rounded-md border border-rule bg-canvas px-4 py-2 text-sm font-semibold text-ink hover:border-brand disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={run}
                    disabled={typed !== "DELETE" || isPending}
                    className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                      typed === "DELETE" && !isPending
                        ? "bg-red-700 text-ink hover:bg-red-600"
                        : "cursor-not-allowed bg-canvas text-white"
                    }`}
                  >
                    {isPending ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
