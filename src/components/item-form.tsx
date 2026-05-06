"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  ConditionGrade,
  ItemStatus,
  LifecycleType,
  type LocationType,
} from "@prisma/client";
import { createItem, updateItem } from "@/lib/actions/items";
import { emptyFormState, type FormState } from "@/lib/actions/state";

type Item = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  barcode: string | null;
  categoryId: string | null;
  status: ItemStatus;
  conditionGrade: ConditionGrade;
  lifecycleType: LifecycleType;
  currentLocationId: string | null;
  homeLocationId: string | null;
  purchaseCost: { toString(): string } | null;
  replacementCost: { toString(): string } | null;
};

type CategoryOption = { id: string; name: string };
type LocationOption = { id: string; name: string; type: LocationType };

const statusLabels: Record<ItemStatus, string> = {
  IN_STORAGE: "In storage",
  RESERVED: "Reserved",
  CHECKED_OUT: "Checked out",
  IN_REPAIR: "In repair",
  RETIRED: "Retired",
  MISSING: "Missing",
};

const conditionLabels: Record<ConditionGrade, string> = {
  A: "A",
  B: "B",
  C: "C",
  RETIRED: "Retired",
};

const lifecycleLabels: Record<LifecycleType, string> = {
  RENTAL_SEASONAL: "Rental (seasonal)",
  SOLD_PERMANENT: "Sold (permanent)",
  INSTALLED_YEAR_ROUND: "Installed year-round",
};

const locationTypeLabels: Record<LocationType, string> = {
  WAREHOUSE: "Warehouse",
  AISLE: "Aisle",
  RACK: "Rack",
  BIN: "Bin",
  VEHICLE: "Vehicle",
};

export function ItemForm({
  item,
  categories,
  locations,
}: {
  item?: Item;
  categories: CategoryOption[];
  locations: LocationOption[];
}) {
  const action = item ? updateItem.bind(null, item.id) : createItem;

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    emptyFormState,
  );

  return (
    <form action={formAction} className="mt-6 max-w-3xl space-y-6">
      <Section title="Identity">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="SKU"
            name="sku"
            defaultValue={item?.sku ?? ""}
            errors={state.errors.sku}
            required
          />
          <Field
            label="Name"
            name="name"
            defaultValue={item?.name ?? ""}
            errors={state.errors.name}
            required
          />
          <Field
            label="Manufacturer"
            name="manufacturer"
            defaultValue={item?.manufacturer ?? ""}
            errors={state.errors.manufacturer}
          />
          <Field
            label="Model"
            name="model"
            defaultValue={item?.model ?? ""}
            errors={state.errors.model}
          />
          <Field
            label="Serial #"
            name="serial"
            defaultValue={item?.serial ?? ""}
            errors={state.errors.serial}
          />
          <Field
            label="Barcode"
            name="barcode"
            defaultValue={item?.barcode ?? ""}
            errors={state.errors.barcode}
          />
        </div>
        <div className="mt-5">
          <TextareaField
            label="Description"
            name="description"
            defaultValue={item?.description ?? ""}
            errors={state.errors.description}
          />
        </div>
      </Section>

      <Section title="Classification">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <SelectField
            label="Category"
            name="categoryId"
            defaultValue={item?.categoryId ?? ""}
            errors={state.errors.categoryId}
          >
            <option value="">— Uncategorized —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Lifecycle"
            name="lifecycleType"
            defaultValue={item?.lifecycleType ?? "RENTAL_SEASONAL"}
            errors={state.errors.lifecycleType}
            required
          >
            {(Object.keys(lifecycleLabels) as LifecycleType[]).map((l) => (
              <option key={l} value={l}>
                {lifecycleLabels[l]}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Status"
            name="status"
            defaultValue={item?.status ?? "IN_STORAGE"}
            errors={state.errors.status}
            required
          >
            {(Object.keys(statusLabels) as ItemStatus[]).map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Condition"
            name="conditionGrade"
            defaultValue={item?.conditionGrade ?? "A"}
            errors={state.errors.conditionGrade}
            required
          >
            {(Object.keys(conditionLabels) as ConditionGrade[]).map((c) => (
              <option key={c} value={c}>
                {conditionLabels[c]}
              </option>
            ))}
          </SelectField>
        </div>
      </Section>

      <Section title="Location">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <SelectField
            label="Home location"
            name="homeLocationId"
            defaultValue={item?.homeLocationId ?? ""}
            errors={state.errors.homeLocationId}
            help="Where it lives in the off-season."
          >
            <option value="">— None —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({locationTypeLabels[l.type]})
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Current location"
            name="currentLocationId"
            defaultValue={item?.currentLocationId ?? ""}
            errors={state.errors.currentLocationId}
            help="Where it is right now."
          >
            <option value="">— None —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({locationTypeLabels[l.type]})
              </option>
            ))}
          </SelectField>
        </div>
      </Section>

      <Section title="Cost">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Purchase cost"
            name="purchaseCost"
            type="number"
            step="0.01"
            min={0}
            defaultValue={item?.purchaseCost?.toString() ?? ""}
            errors={state.errors.purchaseCost}
          />
          <Field
            label="Replacement cost"
            name="replacementCost"
            type="number"
            step="0.01"
            min={0}
            defaultValue={item?.replacementCost?.toString() ?? ""}
            errors={state.errors.replacementCost}
          />
        </div>
      </Section>

      {state.message && <p className="text-sm text-red-400">{state.message}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-santa-red px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Saving..." : item ? "Save changes" : "Create item"}
        </button>
        <Link href="/items" className="text-sm text-gray-400 underline hover:text-white">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-md border border-gray-700 p-5">
      <legend className="px-1 text-sm font-medium text-gray-300">{title}</legend>
      {children}
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
  step,
  min,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  errors?: string[];
  required?: boolean;
  step?: string;
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
        step={step}
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

function TextareaField({
  label,
  name,
  defaultValue,
  errors,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  errors?: string[];
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-300">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        defaultValue={defaultValue}
        rows={3}
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
  help,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  errors?: string[];
  required?: boolean;
  help?: string;
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
      {help && <p className="mt-1 text-xs text-gray-500">{help}</p>}
      {errors?.map((e) => (
        <p key={e} className="mt-1 text-xs text-red-400">
          {e}
        </p>
      ))}
    </div>
  );
}
