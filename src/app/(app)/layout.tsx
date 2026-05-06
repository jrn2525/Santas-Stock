import Link from "next/link";
import { signOut } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
import { Sidebar } from "@/components/sidebar";

const roleLabels: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  USER: "User",
};

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/sign-in" });
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-gray-800 bg-gray-950">
        <div className="border-b border-gray-800 px-4 py-4">
          <Link href="/dashboard" className="block">
            <div className="text-lg font-bold text-santa-red">Santa&apos;s Stock</div>
            <div className="text-xs text-gray-500">Inventory</div>
          </Link>
        </div>

        <Sidebar />

        <div className="mt-auto border-t border-gray-800 p-4 text-xs">
          <div className="text-gray-300">{user.name}</div>
          <div className="text-gray-500">{roleLabels[user.role] ?? user.role}</div>
          <form action={signOutAction} className="mt-2">
            <button
              type="submit"
              className="text-gray-400 underline hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
