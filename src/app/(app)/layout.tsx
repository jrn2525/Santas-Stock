import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/auth";
import { requireUser, roleLabel } from "@/lib/auth-helpers";
import { Sidebar } from "@/components/sidebar";
import { WorkspaceTabs } from "@/components/workspace-tabs";

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
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-rule bg-sidebar px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/job-flow/dashboard" className="block">
            <Image
              src="/logo.png"
              alt="Santa's Stock"
              width={160}
              height={160}
              priority
              className="h-auto w-32"
            />
          </Link>
          <WorkspaceTabs role={user.role} />
        </div>

        <div className="flex items-center gap-4 text-xs">
          <Link
            href="/account"
            className="text-right hover:text-ink"
            title="My account"
          >
            <div className="text-ink">{user.name}</div>
            <div className="text-ink-dim">{roleLabel(user.role)}</div>
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-md border border-rule px-3 py-1.5 text-ink-dim hover:border-brand hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="flex w-56 shrink-0 flex-col border-r border-rule bg-sidebar">
          <Sidebar role={user.role} />
        </aside>
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
