"use client";

import { useActionState } from "react";
import { changeOwnPassword } from "@/lib/actions/users";
import { emptyFormState, type FormState } from "@/lib/actions/state";
import { PasswordInput } from "@/components/password-input";

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
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="mt-1">
        <PasswordInput
          id={name}
          name={name}
          autoComplete={autoComplete}
          required
          fieldLabel={label.toLowerCase()}
        />
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
