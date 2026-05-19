"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";

export function WorkspaceTabs({ role }: { role: Role }) {
  const pathname = usePathname();
  const isInventory = pathname.startsWith("/inventory");
  const isAdmin = pathname.startsWith("/admin");
  const isJobFlow = !isInventory && !isAdmin;

  const tabClass = (active: boolean) =>
    `rounded-md px-6 py-3 text-base font-semibold transition ${
      active
        ? "bg-brand text-ink"
        : "bg-card text-ink hover:bg-card/80"
    }`;

  // Admins only see the Admin tab — Items/Kits/Customers/Jobs are not part
  // of an admin's day-to-day, so hide Job Flow and Inventory from them.
  if (role === "ADMIN") {
    return (
      <div className="flex gap-2 rounded-lg bg-canvas p-1">
        <Link href="/admin/overview" className={tabClass(isAdmin)}>
          Admin
        </Link>
      </div>
    );
  }

  const showAdmin = role === "MANAGER";

  return (
    <div className="flex gap-2 rounded-lg bg-canvas p-1">
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
