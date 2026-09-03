"use client";

import { useState, useTransition } from "react";
import { setUserPassword } from "@/lib/actions/users";

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
  const [visible, setVisible] = useState(false);
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
            setVisible(false);
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
      <div className="relative mt-1">
        <input
          id="admin-set-password"
          type={visible ? "text" : "password"}
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
          className="block w-full rounded-md border border-rule bg-card px-3 py-2 pr-11 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          tabIndex={-1}
          title={visible ? "Hide" : "Show"}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-dim transition hover:text-ink"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
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

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
