"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { releaseAwaitingStock } from "@/lib/actions/auto-allocate";

export function ReleaseButton({
  jobId,
  canRelease,
}: {
  jobId: string;
  canRelease: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!canRelease) return;
    startTransition(async () => {
      await releaseAwaitingStock(jobId);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canRelease || isPending}
      className={`rounded-md px-4 py-2 text-sm font-medium transition ${
        canRelease && !isPending
          ? "bg-brand text-ink hover:bg-brand-hover"
          : "cursor-not-allowed bg-canvas text-ink-dim opacity-50"
      }`}
    >
      {isPending
        ? "Releasing…"
        : canRelease
          ? "Release"
          : "Waiting on inventory"}
    </button>
  );
}
