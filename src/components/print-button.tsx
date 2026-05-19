"use client";

export function PrintButton({ className }: { className?: string } = {}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        className ??
        "no-print rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-ink hover:bg-brand-hover"
      }
    >
      Print
    </button>
  );
}
