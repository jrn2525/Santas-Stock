"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Coded keys keep redirect URLs clean and the copy consistent. A save flow
// opts in by redirecting to `?flash=<key>`.
const MESSAGES: Record<string, string> = {
  "item-created": "Item created.",
  "item-updated": "Item saved.",
  "kit-created": "Kit created.",
  "kit-updated": "Kit saved.",
  "user-created": "User created.",
  "user-updated": "User saved.",
  "user-deleted": "User deleted.",
  "settings-updated": "Settings saved.",
};

export function FlashToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const flash = params.get("flash");
  const [message, setMessage] = useState<string | null>(null);

  // Show the toast and strip the flash param so a refresh or Back doesn't
  // replay it.
  useEffect(() => {
    if (!flash || !(flash in MESSAGES)) return;
    // Intentional: surface the one-shot flash message when the URL param
    // appears, then strip it below. Guarded so it runs once per flash value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessage(MESSAGES[flash]);
    const next = new URLSearchParams(Array.from(params.entries()));
    next.delete("flash");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [flash, params, pathname, router]);

  // Auto-dismiss, keyed on the message so clearing the URL above doesn't
  // cancel the timer.
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(t);
  }, [message]);

  if (!message) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 no-print">
      <div className="flex items-center gap-3 rounded-md border border-rule bg-card px-4 py-3 text-sm text-ink shadow-2xl">
        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-green-400" />
        <span>{message}</span>
        <button
          type="button"
          onClick={() => setMessage(null)}
          className="ml-2 text-ink-dim hover:text-ink"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
