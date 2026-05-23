"use client";

import { useState, useTransition } from "react";
import { resetUserPassword } from "@/lib/actions/users";
import { TempPasswordReveal } from "@/components/temp-password-reveal";

export function ResetPasswordButton({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string;
}) {
  const [pending, startTransition] = useTransition();
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (tempPassword) {
    return (
      <TempPasswordReveal
        tempPassword={tempPassword}
        userEmail={userEmail}
        doneHref="/admin/users"
      />
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              `Generate a new temporary password for ${userEmail}? Their current password will stop working.`,
            )
          ) {
            return;
          }
          startTransition(async () => {
            setError(null);
            try {
              const { tempPassword } = await resetUserPassword(userId);
              setTempPassword(tempPassword);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Reset failed.");
            }
          });
        }}
        className="rounded-md border border-brand bg-canvas px-3 py-2 text-sm font-medium text-brand hover:bg-brand hover:text-ink disabled:opacity-50"
      >
        {pending ? "Generating..." : "Reset password"}
      </button>
      {error && <p className="mt-2 text-xs text-brand">{error}</p>}
    </div>
  );
}
