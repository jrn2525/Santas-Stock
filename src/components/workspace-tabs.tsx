"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";

export function WorkspaceTabs({ role }: { role: Role }) {
  const pathname = usePathname();
  const isInventory = pathname.startsWith("/inventory");
  const isAdmin = pathname.startsWith("/admin");
  const isJobFlow = !isInventory && !isAdmin;

  const showAdmin = role === "ADMIN";

  const tabClass = (active: boolean) =>
    `whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold transition lg:px-6 lg:py-3 lg:text-base ${
      active
        ? "bg-brand text-ink"
        : "bg-card text-ink hover:bg-card/80"
    }`;

  return (
    <div className="flex gap-2 overflow-x-auto rounded-lg bg-canvas p-1">
      <Link href="/job-flow/dashboard" className={tabClass(isJobFlow)}>
        Job Flow
      </Link>
      <Link href="/inventory/dashboard" className={tabClass(isInventory)}>
        Inventory
      </Link>
      {showAdmin && (
        <Link href="/admin/overview" className={tabClass(isAdmin)}>
          Admin
        </Link>
      )}
    </div>
  );
}
