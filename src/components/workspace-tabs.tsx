"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function WorkspaceTabs() {
  const pathname = usePathname();
  const isInventory = pathname.startsWith("/inventory");
  const isJobFlow = !isInventory;

  const tabClass = (active: boolean) =>
    `rounded-md px-4 py-2 text-sm font-medium transition ${
      active
        ? "bg-brand text-ink"
        : "text-ink-dim hover:bg-card/40 hover:text-ink"
    }`;

  return (
    <div className="flex gap-1 rounded-lg bg-canvas p-1">
      <Link href="/job-flow/dashboard" className={tabClass(isJobFlow)}>
        Job Flow
      </Link>
      <Link href="/inventory/dashboard" className={tabClass(isInventory)}>
        Inventory
      </Link>
    </div>
  );
}
