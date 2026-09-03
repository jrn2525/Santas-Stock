"use client";

import { useState, useTransition } from "react";
import { setUserPassword } from "@/lib/actions/users";
import { PasswordInput } from "@/components/password-input";

/**
 * Admin-chosen password for another user. Companion to ResetPasswordButton:
 * that one generates a random temp password, this one lets the admin type the
 * password they want to hand over.
 *
 * The value is shown in plain text on demand (eye toggle) because the admin has
 * to read it back to relay it — a masked field they can't verify is how typos
 * become "I can't log in" support calls.
 */
export function SetPasswordForm({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string;
}) {
  const [password, setPassword] = useState("");
  const [requireChange, setRequireChange] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const canSubmit = password.length >= 8 && !pending;

  function submit() {
    if (!canSubmit) return;
    if (
      !confirm(
        `Set a new password for ${userEmail}? Their current password will stop working immediately.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      setError(null);
      try {
        const res = await setUserPassword(userId, password, requireChange);
        if (!res.ok) {
          setError(res.error ?? "Could not set the password.");
          return;
        }
        setSaved(true);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not set the password.",
        );
      }
    });
  }

  if (saved) {
    return (
      <div className="rounded-md border border-green-600/40 bg-green-600/10 p-4">
        <p className="text-sm font-medium text-green-200">
          Password updated for {userEmail}.
        </p>
        <p className="mt-1 text-sm text-ink-dim">
          Give them this password:{" "}
          <code className="rounded bg-canvas px-2 py-0.5 font-mono text-ink">
            {password}
          </code>
        </p>
        <p className="mt-2 text-xs text-ink-dim">
          {requireChange
            ? "They'll be asked to choose their own password when they sign in."
            : "They can sign in with this password and keep using it."}
        </p>
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setPassword("");
            setRequireChange(false);
          }}
          className="mt-3 rounded-md border border-rule bg-canvas px-3 py-1.5 text-sm font-medium text-ink hover:border-brand"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md">
      <label
        htmlFor="admin-set-password"
        className="block text-sm font-medium text-ink"
      >
        New password
      </label>
      <div className="mt-1">
        <PasswordInput
          id="admin-set-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          fieldLabel="new password"
        />
      </div>
      {tooShort && (
        <p className="mt-1 text-xs text-brand">
          Must be at least 8 characters.
        </p>
      )}

      <label className="mt-3 flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={requireChange}
          onChange={(e) => setRequireChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-rule bg-canvas text-brand focus:ring-brand"
        />
        <span>
          Require them to change it at next login
          <span className="block text-xs text-ink-dim">
            Leave unchecked and the password you set just works.
          </span>
        </span>
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="mt-4 rounded-md bg-brand px-3 py-2 text-sm font-medium text-ink hover:bg-brand-hover disabled:opacity-50"
      >
        {pending ? "Saving..." : "Set password"}
      </button>
      {error && <p className="mt-2 text-xs text-brand">{error}</p>}
    </div>
  );
}

