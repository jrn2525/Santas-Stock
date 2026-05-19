"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";

type NavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
};

const jobFlowNav: NavItem[] = [
  { href: "/job-flow/dashboard", label: "Dashboard" },
  { href: "/job-flow/job-flows", label: "Job Flows" },
  { href: "/job-flow/customers", label: "Customers" },
  { href: "/job-flow/jobs", label: "Jobs" },
  { href: "/job-flow/pick-list", label: "Pick List" },
  { href: "/job-flow/calendar", label: "Calendar" },
  { href: "/job-flow/jobber", label: "Jobber", adminOnly: true },
];

const inventoryNav: NavItem[] = [
  { href: "/inventory/dashboard", label: "Dashboard" },
  { href: "/inventory/items", label: "Items" },
  { href: "/inventory/kits", label: "Kits" },
];

// Admin section now owns Import / Export and Jobber sync (formerly under
// Inventory). Keeps the Admin role's UI focused on system-admin tasks.
const adminNav: NavItem[] = [
  { href: "/admin/overview", label: "Overview" },
  { href: "/admin/users", label: "Users", adminOnly: true },
  { href: "/inventory/import-export", label: "Import / Export", adminOnly: true },
  { href: "/inventory/jobber", label: "Jobber sync", adminOnly: true },
];

function pickNav(pathname: string, role: Role): NavItem[] {
  // Admins always see the Admin sidebar — even when they're on an
  // /inventory/import-export or /inventory/jobber page that lives under
  // the Inventory route prefix.
  if (role === "ADMIN") return adminNav;
  if (pathname.startsWith("/inventory")) return inventoryNav;
  if (pathname.startsWith("/admin")) return adminNav;
  return jobFlowNav;
}

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const navItems = pickNav(pathname, role);

  return (
    <nav className="flex flex-col gap-1 p-4">
      {navItems
        .filter((item) => !item.adminOnly || role === "ADMIN")
        .map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                active
                  ? "bg-brand/15 text-brand"
                  : "text-ink-dim hover:bg-card/40 hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
    </nav>
  );
}
