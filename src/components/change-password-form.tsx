"use client";

import { useActionState, useState } from "react";
import { changeOwnPassword } from "@/lib/actions/users";
import { emptyFormState, type FormState } from "@/lib/actions/state";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    changeOwnPassword,
    emptyFormState,
  );

  return (
    <form action={formAction} className="mt-6 max-w-md space-y-5">
      <Field
        label="Current password"
        name="currentPassword"
        autoComplete="current-password"
        errors={state.errors.currentPassword}
      />
      <Field
        label="New password"
        name="newPassword"
        autoComplete="new-password"
        errors={state.errors.newPassword}
        help="At least 8 characters."
      />
      <Field
        label="Confirm new password"
        name="confirmPassword"
        autoComplete="new-password"
        errors={state.errors.confirmPassword}
      />

      {state.message && <p className="text-sm text-brand">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-hover disabled:opacity-50"
      >
        {pending ? "Updating..." : "Change password"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  autoComplete,
  errors,
  help,
}: {
  label: string;
  name: string;
  autoComplete: string;
  errors?: string[];
  help?: string;
}) {
  // Each field toggles independently — seeing the new password while
  // confirming it is the common case.
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          // Extra right padding so typed text never runs under the button.
          className="block w-full rounded-md border border-rule bg-card px-3 py-2 pr-11 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // aria-label (not just the icon) so screen readers announce it,
          // and tabIndex -1 keeps it out of the tab path between fields.
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          tabIndex={-1}
          title={visible ? "Hide" : "Show"}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-dim transition hover:text-ink focus:outline-none focus-visible:text-ink"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {help && <p className="mt-1 text-xs text-ink-dim">{help}</p>}
      {errors?.map((e) => (
        <p key={e} className="mt-1 text-xs text-brand">
          {e}
        </p>
      ))}
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
