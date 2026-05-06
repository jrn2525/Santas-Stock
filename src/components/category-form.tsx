"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createCategory, updateCategory } from "@/lib/actions/categories";
import { emptyFormState, type FormState } from "@/lib/actions/state";

type Category = {
  id: string;
  name: string;
  parentId: string | null;
  defaultRetirementMaxSeasons: number | null;
  defaultRetirementMaxRepairs: number | null;
  defaultRetirementConditionFloor: "A" | "B" | "C" | "RETIRED" | null;
};

type ParentOption = { id: string; name: string };

export function CategoryForm({
  category,
  parents,
}: {
  category?: Category;
  parents: ParentOption[];
}) {
  const action = category
    ? updateCategory.bind(null, category.id)
    : createCategory;

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    emptyFormState,
  );

  return (
    <form action={formAction} className="mt-6 max-w-xl space-y-5">
      <Field
        label="Name"
        name="name"
        defaultValue={category?.name ?? ""}
        errors={state.errors.name}
        required
      />

      <SelectField
        label="Parent category"
        name="parentId"
        defaultValue={category?.parentId ?? ""}
        errors={state.errors.parentId}
      >
        <option value="">— None (top level) —</option>
        {parents
          .filter((p) => p.id !== category?.id)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </SelectField>

      <fieldset className="space-y-4 rounded-md border border-gray-700 p-4">
        <legend className="px-1 text-sm font-medium text-gray-300">
          Default retirement profile
        </legend>
        <p className="text-xs text-gray-500">
          Items in this category inherit these values unless overridden on the item.
        </p>

        <Field
          label="Max seasons"
          name="defaultRetirementMaxSeasons"
          type="number"
          min={1}
          defaultValue={category?.defaultRetirementMaxSeasons ?? ""}
          errors={state.errors.defaultRetirementMaxSeasons}
        />

        <Field
          label="Max repair count"
          name="defaultRetirementMaxRepairs"
          type="number"
          min={1}
          defaultValue={category?.defaultRetirementMaxRepairs ?? ""}
          errors={state.errors.defaultRetirementMaxRepairs}
        />

        <SelectField
          label="Minimum acceptable condition"
          name="defaultRetirementConditionFloor"
          defaultValue={category?.defaultRetirementConditionFloor ?? ""}
          errors={state.errors.defaultRetirementConditionFloor}
        >
          <option value="">— Not set —</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </SelectField>
      </fieldset>

      {state.message && <p className="text-sm text-red-400">{state.message}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-santa-red px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Saving..." : category ? "Save changes" : "Create category"}
        </button>
        <Link
          href="/categories"
          className="text-sm text-gray-400 underline hover:text-white"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  errors,
  required,
  min,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  errors?: string[];
  required?: boolean;
  min?: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-300">
        {label}
        {required && <span className="ml-0.5 text-santa-red">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        min={min}
        className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-white focus:border-santa-red focus:outline-none focus:ring-1 focus:ring-santa-red"
      />
      {errors?.map((e) => (
        <p key={e} className="mt-1 text-xs text-red-400">
          {e}
        </p>
      ))}
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  errors,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  errors?: string[];
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-300">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-white focus:border-santa-red focus:outline-none focus:ring-1 focus:ring-santa-red"
      >
        {children}
      </select>
      {errors?.map((e) => (
        <p key={e} className="mt-1 text-xs text-red-400">
          {e}
        </p>
      ))}
    </div>
  );
}
