"use client";

import Link from "next/link";
import { useState } from "react";

export function TempPasswordReveal({
  tempPassword,
  userEmail,
  doneHref = "/admin/users",
}: {
  tempPassword: string;
  userEmail?: string;
  doneHref?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail in some browsers / iframes; the password is
      // still visible on screen so the admin can read it.
    }
  };

  return (
    <div className="mt-6 rounded-lg border border-brand bg-brand/10 p-6">
      <h2 className="text-lg font-semibold text-ink">Temporary password</h2>
      <p className="mt-1 text-sm text-ink-dim">
        Share this password with{" "}
        {userEmail ? <span className="text-ink">{userEmail}</span> : "the user"}{" "}
        out-of-band (in person, phone, text). They&apos;ll be required to
        change it on first login. <strong>This password is shown only once</strong> —
        leave this page and it&apos;s gone.
      </p>

      <div className="mt-4 flex items-center gap-3 rounded-md border border-rule bg-canvas px-4 py-3">
        <code className="flex-1 break-all font-mono text-lg text-ink">
          {tempPassword}
        </code>
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-rule bg-card px-3 py-1.5 text-sm font-medium text-ink hover:border-brand hover:text-brand"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="mt-6">
        <Link
          href={doneHref}
          className="inline-block rounded-md bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-hover"
        >
          Done
        </Link>
      </div>
    </div>
  );
}
