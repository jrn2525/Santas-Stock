import Image from "next/image";
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
      <aside className="flex w-56 shrink-0 flex-col border-r border-rule bg-sidebar">
        <div className="flex items-center justify-center px-4 py-6">
          <Link href="/dashboard" className="block">
            <Image
              src="/logo.png"
              alt="Santa's Stock"
              width={160}
              height={160}
              priority
              className="h-auto w-32"
            />
          </Link>
        </div>

        <Sidebar role={user.role} />

        <div className="mt-auto border-t border-rule p-4 text-xs">
          <div className="text-ink">{user.name}</div>
          <div className="text-ink-dim">{roleLabels[user.role] ?? user.role}</div>
          <form action={signOutAction} className="mt-2">
            <button
              type="submit"
              className="text-ink-dim underline hover:text-ink"
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
