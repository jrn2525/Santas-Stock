"use client";

import { useState, type ReactNode } from "react";

export function DeleteButton({
  action,
  itemLabel,
  children = "Delete",
}: {
  action: () => Promise<void>;
  itemLabel: string;
  children?: ReactNode;
}) {
  const [pending, setPending] = useState(false);

  return (
    <form
      action={async () => {
        if (!confirm(`Delete "${itemLabel}"? This cannot be undone.`)) return;
        setPending(true);
        try {
          await action();
        } finally {
          setPending(false);
        }
      }}
      className="inline"
    >
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-brand hover:text-brand-hover disabled:opacity-50"
      >
        {pending ? "Deleting..." : children}
      </button>
    </form>
  );
}
