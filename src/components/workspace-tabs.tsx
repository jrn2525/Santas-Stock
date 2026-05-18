"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function WorkspaceTabs() {
  const pathname = usePathname();
  const isInventory = pathname.startsWith("/inventory");
  const isJobFlow = !isInventory;

  const tabClass = (active: boolean) =>
    `rounded-md px-6 py-3 text-base font-semibold transition ${
      active
        ? "bg-brand text-ink"
        : "bg-card text-ink hover:bg-card/80"
    }`;

  return (
    <div className="flex gap-2 rounded-lg bg-canvas p-1">
      <Link href="/job-flow/dashboard" className={tabClass(isJobFlow)}>
        Job Flow
      </Link>
      <Link href="/inventory/dashboard" className={tabClass(isInventory)}>
        Inventory
      </Link>
    </div>
  );
}
