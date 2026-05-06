"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LocationType } from "@prisma/client";
import { createLocation, updateLocation } from "@/lib/actions/locations";
import { emptyFormState, type FormState } from "@/lib/actions/state";

type Location = {
  id: string;
  name: string;
  type: LocationType;
  parentId: string | null;
  barcode: string | null;
};

type ParentOption = { id: string; name: string; type: LocationType };

const typeLabels: Record<LocationType, string> = {
  WAREHOUSE: "Warehouse",
  AISLE: "Aisle",
  RACK: "Rack",
  BIN: "Bin",
  VEHICLE: "Vehicle",
};

export function LocationForm({
  location,
  parents,
}: {
  location?: Location;
  parents: ParentOption[];
}) {
  const action = location
    ? updateLocation.bind(null, location.id)
    : createLocation;

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    emptyFormState,
  );

  return (
    <form action={formAction} className="mt-6 max-w-xl space-y-5">
      <Field
        label="Name"
        name="name"
        defaultValue={location?.name ?? ""}
        errors={state.errors.name}
        required
      />

      <SelectField
        label="Type"
        name="type"
        defaultValue={location?.type ?? "BIN"}
        errors={state.errors.type}
        required
      >
        {(Object.keys(typeLabels) as LocationType[]).map((t) => (
          <option key={t} value={t}>
            {typeLabels[t]}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Parent location"
        name="parentId"
        defaultValue={location?.parentId ?? ""}
        errors={state.errors.parentId}
      >
        <option value="">— None (top level) —</option>
        {parents
          .filter((p) => p.id !== location?.id)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({typeLabels[p.type]})
            </option>
          ))}
      </SelectField>

      <Field
        label="Barcode"
        name="barcode"
        defaultValue={location?.barcode ?? ""}
        errors={state.errors.barcode}
      />

      {state.message && <p className="text-sm text-red-400">{state.message}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-santa-red px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Saving..." : location ? "Save changes" : "Create location"}
        </button>
        <Link
          href="/locations"
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
  defaultValue,
  errors,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  errors?: string[];
  required?: boolean;
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
        defaultValue={defaultValue}
        required={required}
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
  required,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  errors?: string[];
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-300">
        {label}
        {required && <span className="ml-0.5 text-santa-red">*</span>}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        required={required}
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
