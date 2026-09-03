"use client";

import { useState, type InputHTMLAttributes } from "react";

/**
 * A password field with a show/hide eye button on the right.
 *
 * Shared by sign-in, the change-password form, and the admin set-password
 * form so the behavior and icons stay identical everywhere. Works both
 * uncontrolled (plain `name` form submission) and controlled (`value` +
 * `onChange`) — it only owns the visibility toggle.
 */
export function PasswordInput({
  fieldLabel = "password",
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  /** Used in the toggle's aria-label, e.g. "Show current password". */
  fieldLabel?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...inputProps}
        type={visible ? "text" : "password"}
        // pr-11 keeps typed text clear of the button.
        className="block w-full rounded-md border border-rule bg-card px-3 py-2 pr-11 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // Labelled for screen readers rather than relying on the icon, and
        // kept out of the tab order so tabbing runs field -> field -> submit.
        aria-label={visible ? `Hide ${fieldLabel}` : `Show ${fieldLabel}`}
        aria-pressed={visible}
        tabIndex={-1}
        title={visible ? "Hide" : "Show"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-dim transition hover:text-ink"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
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
