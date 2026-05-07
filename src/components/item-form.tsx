"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ItemStatus, ProductType } from "@prisma/client";
import { createItem, updateItem } from "@/lib/actions/items";
import { emptyFormState, type FormState } from "@/lib/actions/state";

type Item = {
  id: string;
  sku: string | null;
  name: string;
  description: string;
  manufacturer: string | null;
  model: string | null;
  productType: ProductType | null;
  status: ItemStatus;
  quantity: number;
  homeLocation: string | null;
  currentLocation: string | null;
  unitCost: { toString(): string } | null;
};

const statusLabels: Record<ItemStatus, string> = {
  AVAILABLE: "Available",
  ALLOCATED: "Allocated",
};

const productTypeLabels: Record<ProductType, string> = {
  CHRISTMAS: "Christmas",
  LANDSCAPE: "Landscape",
  PERMANENT: "Permanent",
};

export function ItemForm({ item }: { item?: Item }) {
  const action = item ? updateItem.bind(null, item.id) : createItem;

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    emptyFormState,
  );

  return (
    <form action={formAction} className="mt-6 max-w-3xl space-y-6">
      <Section title="Identity">
        <div className="grid grid-cols-1 gap-5">
          <Field
            label="Name"
            name="name"
            defaultValue={item?.name ?? ""}
            errors={state.errors.name}
            required
          />
          <Field
            label="Description"
            name="description"
            defaultValue={item?.description ?? ""}
            errors={state.errors.description}
            required
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Field
              label="SKU"
              name="sku"
              defaultValue={item?.sku ?? ""}
              errors={state.errors.sku}
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
          </div>
        </div>
      </Section>

      <Section title="Classification">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <SelectField
            label="Product type"
            name="productType"
            defaultValue={item?.productType ?? ""}
            errors={state.errors.productType}
          >
            <option value="">— Unassigned —</option>
            {(Object.keys(productTypeLabels) as ProductType[]).map((p) => (
              <option key={p} value={p}>
                {productTypeLabels[p]}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Status"
            name="status"
            defaultValue={item?.status ?? "AVAILABLE"}
            errors={state.errors.status}
            required
          >
            {(Object.keys(statusLabels) as ItemStatus[]).map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </SelectField>

          <Field
            label="Quantity"
            name="quantity"
            type="number"
            min={0}
            defaultValue={item?.quantity ?? 0}
            errors={state.errors.quantity}
            required
          />
        </div>
      </Section>

      <Section title="Location">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Home location"
            name="homeLocation"
            defaultValue={item?.homeLocation ?? ""}
            errors={state.errors.homeLocation}
            help='Where it lives in the off-season. Example: "Aisle 1, Rack 2B, Shelf 3C".'
          />
          <Field
            label="Current location"
            name="currentLocation"
            defaultValue={item?.currentLocation ?? ""}
            errors={state.errors.currentLocation}
            help="Where it is right now."
          />
        </div>
      </Section>

      <Section title="Cost">
        <div>
          <label htmlFor="unitCost" className="block text-sm font-medium text-ink">
            Unit cost
          </label>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-dim">
              $
            </span>
            <input
              id="unitCost"
              name="unitCost"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              defaultValue={item?.unitCost?.toString() ?? ""}
              placeholder="0.00"
              className="block w-full rounded-md border border-rule bg-card py-2 pl-7 pr-3 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <p className="mt-1 text-xs text-ink-dim">What we paid per unit.</p>
          {state.errors.unitCost?.map((e) => (
            <p key={e} className="mt-1 text-xs text-brand">
              {e}
            </p>
          ))}
        </div>
      </Section>

      {state.message && <p className="text-sm text-brand">{state.message}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-hover disabled:opacity-50"
        >
          {pending ? "Saving..." : item ? "Save changes" : "Create item"}
        </button>
        <Link href="/items" className="text-sm text-ink-dim underline hover:text-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-md border border-rule bg-card p-5">
      <legend className="px-1 text-sm font-medium text-ink">{title}</legend>
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
  help,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  errors?: string[];
  required?: boolean;
  step?: string;
  min?: number;
  help?: string;
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
        step={step}
        min={min}
        className="mt-1 block w-full rounded-md border border-rule bg-canvas px-3 py-2 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
      {help && <p className="mt-1 text-xs text-ink-dim">{help}</p>}
      {errors?.map((e) => (
        <p key={e} className="mt-1 text-xs text-brand">
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
      <label htmlFor={name} className="block text-sm font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-brand">*</span>}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="mt-1 block w-full rounded-md border border-rule bg-canvas px-3 py-2 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      >
        {children}
      </select>
      {help && <p className="mt-1 text-xs text-ink-dim">{help}</p>}
      {errors?.map((e) => (
        <p key={e} className="mt-1 text-xs text-brand">
          {e}
        </p>
      ))}
    </div>
  );
}
