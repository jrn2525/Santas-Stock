"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/items", label: "Items" },
  { href: "/kits", label: "Kits" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-4">
      {navItems.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              active
                ? "bg-santa-red/20 text-santa-red"
                : "text-gray-300 hover:bg-gray-800 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
