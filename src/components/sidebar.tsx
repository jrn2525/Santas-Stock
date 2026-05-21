"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";

type NavItem = {
  href: string;
  label: string;
  // If omitted, visible to every role. Otherwise restricted to the listed
  // roles. Page-level requireRole() calls are the source of truth — this
  // just hides links the user can't use.
  visibleTo?: Role[];
};

const jobFlowNav: NavItem[] = [
  { href: "/job-flow/dashboard", label: "Dashboard" },
  { href: "/job-flow/job-flows", label: "Job Flow" },
  { href: "/job-flow/jobs", label: "Jobs" },
  { href: "/job-flow/pick-list", label: "Pick List" },
  { href: "/job-flow/calendar", label: "Calendar" },
  { href: "/job-flow/jobber", label: "Jobber", visibleTo: ["ADMIN", "MANAGER"] },
];

const inventoryNav: NavItem[] = [
  { href: "/inventory/dashboard", label: "Dashboard" },
  { href: "/inventory/items", label: "Items" },
  { href: "/inventory/kits", label: "Kits" },
  { href: "/inventory/dead-stock", label: "Dead Stock" },
  { href: "/inventory/replacements", label: "Replacements" },
  { href: "/inventory/jobber", label: "Jobber", visibleTo: ["ADMIN", "MANAGER"] },
];

const adminNav: NavItem[] = [
  { href: "/admin/overview", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/inventory/import-export", label: "Import / Export" },
  { href: "/admin/cleanup", label: "Data cleanup" },
];

function pickNav(pathname: string): NavItem[] {
  if (pathname.startsWith("/inventory")) return inventoryNav;
  if (pathname.startsWith("/admin")) return adminNav;
  return jobFlowNav;
}

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const navItems = pickNav(pathname);

  return (
    <nav className="flex flex-col gap-1 p-4">
      {navItems
        .filter((item) => !item.visibleTo || item.visibleTo.includes(role))
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
