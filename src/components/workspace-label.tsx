"use client";

import { usePathname } from "next/navigation";

export function WorkspaceLabel() {
  const pathname = usePathname();
  const label = pathname.startsWith("/inventory") ? "Inventory" : "Job Flow";

  return (
    <div className="text-lg font-semibold text-ink">{label}</div>
  );
}
