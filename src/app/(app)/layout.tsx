import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
import { getSettings, logoUrl } from "@/lib/settings";
import { Sidebar } from "@/components/sidebar";
import { WorkspaceTabs } from "@/components/workspace-tabs";
import { DemoBanner } from "@/components/demo-banner";
import { FlashToast } from "@/components/flash-toast";

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
  const settings = await getSettings();

  // A user on a temporary password can only go to the change-password screen —
  // the auth middleware bounces every other route. Showing them a full nav is a
  // trap: every link is a dead end. Hide navigation until the password is set.
  const mustChangePassword = user.mustChangePassword === true;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-sidebar px-4 py-4 lg:px-6">
        <div className="flex items-center gap-3 lg:gap-6">
          <Link href="/job-flow/dashboard" className="block">
            {settings.hasCustomLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl(settings.logoVersion)}
                alt={settings.businessName}
                className="h-auto w-24 lg:w-32"
              />
            ) : (
              <Image
                src="/logo.png"
                alt={settings.businessName}
                width={160}
                height={160}
                priority
                className="h-auto w-24 lg:w-32"
              />
            )}
          </Link>
          {!mustChangePassword && <WorkspaceTabs role={user.role} />}
        </div>

        <div className="flex items-center gap-4 text-xs">
          {!mustChangePassword && (
          <Link
            href="/settings"
            title="Settings"
            aria-label="Settings"
            className="text-ink-dim hover:text-ink"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
          )}
          {mustChangePassword ? (
            <div className="text-right text-ink">{user.name}</div>
          ) : (
            <Link
              href="/settings"
              className="text-right hover:text-ink"
              title="Your account &amp; settings"
            >
              <div className="text-ink">{user.name}</div>
            </Link>
          )}
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

      {/* Mobile nav: the sidebar collapses to a scrollable top bar below lg. */}
      {!mustChangePassword && (
        <nav className="border-b border-rule bg-sidebar lg:hidden">
          <Sidebar role={user.role} orientation="horizontal" />
        </nav>
      )}

      <div className="flex flex-1">
        {!mustChangePassword && (
          <aside className="hidden w-56 shrink-0 flex-col border-r border-rule bg-sidebar lg:flex">
            <Sidebar role={user.role} />
          </aside>
        )}
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {user.role === "GUEST" && <DemoBanner />}
          {children}
        </main>
      </div>

      <Suspense fallback={null}>
        <FlashToast />
      </Suspense>
    </div>
  );
}
