"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Role } from "@prisma/client";
import {
  createUser,
  updateUser,
  type CreateUserState,
} from "@/lib/actions/users";
import { emptyFormState, type FormState } from "@/lib/actions/state";
import { TempPasswordReveal } from "@/components/temp-password-reveal";

const ROLE_OPTIONS: { value: Role; label: string; help: string }[] = [
  { value: "ADMIN", label: "Admin", help: "Full control, including user management." },
  { value: "MANAGER", label: "Manager", help: "Manages inventory and jobs. No user management." },
  { value: "USER", label: "Crew", help: "Basic access for day-to-day operations." },
  { value: "GUEST", label: "Guest", help: "Read-only demo account. Can browse but not change anything." },
];

const emptyCreateState: CreateUserState = { errors: {}, message: null };

export function NewUserForm() {
  const [state, formAction, pending] = useActionState<
    CreateUserState,
    FormData
  >(createUser, emptyCreateState);

  if (state.tempPassword) {
    return <TempPasswordReveal tempPassword={state.tempPassword} />;
  }

  return (
    <form action={formAction} className="mt-6 max-w-2xl space-y-6">
      <Identity errors={state.errors} />

      {state.message && <p className="text-sm text-brand">{state.message}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-hover disabled:opacity-50"
        >
          {pending ? "Creating..." : "Create user"}
        </button>
        <Link
          href="/admin/users"
          className="text-sm text-ink-dim underline hover:text-ink"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

type EditableUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
};

export function EditUserForm({ user }: { user: EditableUser }) {
  const action = updateUser.bind(null, user.id);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    emptyFormState,
  );

  return (
    <form action={formAction} className="mt-6 max-w-2xl space-y-6">
      <Identity errors={state.errors} defaults={user} />

      <fieldset className="rounded-md border border-rule bg-card p-5">
        <legend className="px-1 text-sm font-medium text-ink">Status</legend>
        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            name="active"
            defaultChecked={user.active}
            className="h-4 w-4 rounded border-rule bg-canvas text-brand focus:ring-brand"
          />
          <span>
            Active
            <span className="ml-2 text-xs text-ink-dim">
              Uncheck to disable login without deleting the account.
            </span>
          </span>
        </label>
      </fieldset>

      {state.message && <p className="text-sm text-brand">{state.message}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-hover disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save changes"}
        </button>
        <Link
          href="/admin/users"
          className="text-sm text-ink-dim underline hover:text-ink"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Identity({
  errors,
  defaults,
}: {
  errors: Record<string, string[]>;
  defaults?: { name: string; email: string; role: Role };
}) {
  return (
    <fieldset className="rounded-md border border-rule bg-card p-5">
      <legend className="px-1 text-sm font-medium text-ink">Identity</legend>
      <div className="grid grid-cols-1 gap-5">
        <Field
          label="Name"
          name="name"
          defaultValue={defaults?.name ?? ""}
          errors={errors.name}
          required
        />
        <Field
          label="Email"
          name="email"
          type="email"
          defaultValue={defaults?.email ?? ""}
          errors={errors.email}
          required
        />
        <div>
          <label
            htmlFor="role"
            className="block text-sm font-medium text-ink"
          >
            Role <span className="ml-0.5 text-brand">*</span>
          </label>
          <select
            id="role"
            name="role"
            defaultValue={defaults?.role ?? "USER"}
            required
            className="mt-1 block w-full rounded-md border border-rule bg-canvas px-3 py-2 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ul className="mt-2 space-y-1 text-xs text-ink-dim">
            {ROLE_OPTIONS.map((opt) => (
              <li key={opt.value}>
                <span className="text-ink">{opt.label}:</span> {opt.help}
              </li>
            ))}
          </ul>
          {errors.role?.map((e) => (
            <p key={e} className="mt-1 text-xs text-brand">
              {e}
            </p>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  errors,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  errors?: string[];
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-brand">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="mt-1 block w-full rounded-md border border-rule bg-canvas px-3 py-2 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
      {errors?.map((e) => (
        <p key={e} className="mt-1 text-xs text-brand">
          {e}
        </p>
      ))}
    </div>
  );
}
