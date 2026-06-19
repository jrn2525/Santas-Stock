"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ItemStatus, ProductType } from "@prisma/client";
import { createItem, updateItem } from "@/lib/actions/items";
import { emptyFormState, type FormState } from "@/lib/actions/state";
import { to2Dp } from "@/lib/format";

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
  minQuantity: number;
  active: boolean;
  tracksStock: boolean;
  homeLocation: string | null;
  currentLocation: string | null;
  unitCost: { toString(): string } | null;
  websites: string[];
  jobberProductId: string | null;
};

type WebsiteRow = { key: string; url: string };
let websiteRowKeyCounter = 0;
const newWebsiteKey = () => `web-${++websiteRowKeyCounter}`;

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

  const [websites, setWebsites] = useState<WebsiteRow[]>(() => {
    if (item && item.websites.length > 0) {
      return item.websites.map((url) => ({ key: newWebsiteKey(), url }));
    }
    return [{ key: newWebsiteKey(), url: "" }];
  });

  const updateWebsite = (key: string, url: string) =>
    setWebsites((rs) => rs.map((r) => (r.key === key ? { ...r, url } : r)));
  const removeWebsite = (key: string) =>
    setWebsites((rs) =>
      rs.length > 1 ? rs.filter((r) => r.key !== key) : rs,
    );
  const addWebsite = () =>
    setWebsites((rs) => [...rs, { key: newWebsiteKey(), url: "" }]);

  const submitWithWebsites = (formData: FormData) => {
    const cleaned = websites
      .map((r) => r.url.trim())
      .filter((u) => u.length > 0);
    formData.set("websites", JSON.stringify(cleaned));
    formAction(formData);
  };

  // Once an Item exists, Name / Description / Unit Cost are owned by Jobber
  // and can only be changed there. The create form still allows entering
  // them so manually-created rows can be seeded.
  const editing = !!item;

  return (
    <form action={submitWithWebsites} className="mt-6 max-w-3xl space-y-6">
      {editing && (
        <div className="rounded-md border border-rule bg-card p-4 text-sm text-white">
          🔒 <strong className="text-ink">Name</strong>,{" "}
          <strong className="text-ink">Description</strong>, and{" "}
          <strong className="text-ink">Unit Cost</strong> are managed in
          Jobber. To change them, edit the product in Jobber and re-run
          Inventory → Jobber → Sync.
        </div>
      )}

      <Section title="Identity">
        <div className="grid grid-cols-1 gap-5">
          <Field
            label="Name"
            name="name"
            defaultValue={item?.name ?? ""}
            errors={state.errors.name}
            required
            readOnly={editing}
          />
          <Field
            label="Description"
            name="description"
            defaultValue={item?.description ?? ""}
            errors={state.errors.description}
            required
            readOnly={editing}
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
          <div>
            <label className="block text-sm font-medium text-ink">Category</label>
            <input
              type="text"
              value="Product"
              readOnly
              className="mt-1 block w-full cursor-not-allowed rounded-md border border-rule bg-canvas/50 px-3 py-2 text-ink-dim"
            />
            <p className="mt-1 text-xs text-ink-dim">
              Items are always Products. Services belong on the Kits tab.
            </p>
          </div>

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
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field
            label="Quantity"
            name="quantity"
            type="number"
            min={0}
            defaultValue={item?.quantity ?? 0}
            errors={state.errors.quantity}
            required
          />

          <Field
            label="Min quantity"
            name="minQuantity"
            type="number"
            min={0}
            defaultValue={item?.minQuantity ?? 0}
            errors={state.errors.minQuantity}
            help="Low-stock alert when at or below this number. 0 to disable."
          />

          <div className="flex items-end pb-1">
            <label className="flex items-center gap-3 text-sm text-ink">
              <input
                type="checkbox"
                name="active"
                defaultChecked={item?.active ?? true}
                className="h-4 w-4 rounded border-rule bg-canvas text-brand focus:ring-brand"
              />
              <span>
                Active
                <span className="ml-2 text-xs text-ink-dim">
                  Uncheck to hide this item from pickers without deleting it.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="mt-5 rounded-md border border-rule bg-canvas p-4">
          <label className="flex items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="tracksStock"
              defaultChecked={item?.tracksStock ?? true}
              className="mt-0.5 h-4 w-4 rounded border-rule bg-canvas text-brand focus:ring-brand"
            />
            <span>
              Track stock for this item
              <span className="mt-1 block text-xs text-ink-dim">
                Leave checked for physical inventory. <strong>Uncheck for
                pay-by-the-hour services</strong> (e.g. Specialty Service, Lift
                Service) — these are never deducted, never run short, and never
                put a job on Awaiting Stock.
              </span>
            </span>
          </label>
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
              defaultValue={item?.unitCost != null ? to2Dp(item.unitCost) : ""}
              placeholder="0.00"
              readOnly={editing}
              onBlur={(e) => {
                if (e.target.value === "") return;
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) e.target.value = to2Dp(n);
              }}
              className={`block w-full rounded-md border border-rule py-2 pl-7 pr-3 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand ${
                editing
                  ? "cursor-not-allowed bg-canvas/50 text-ink-dim"
                  : "bg-card"
              }`}
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

      <Section title="Vendor websites">
        <p className="mb-4 text-xs text-ink-dim">
          Links you use to check stock with your vendor(s). Add one per row —
          paste the full URL.
        </p>

        <div className="space-y-3">
          {websites.map((row, idx) => (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-rule bg-canvas p-3"
            >
              <div>
                <label
                  htmlFor={`website-${row.key}`}
                  className="block text-xs font-medium text-ink-dim"
                >
                  Website {idx + 1}
                </label>
                <input
                  id={`website-${row.key}`}
                  type="url"
                  inputMode="url"
                  value={row.url}
                  onChange={(e) => updateWebsite(row.key, e.target.value)}
                  placeholder="https://example.com/product/12345"
                  className="mt-1 block w-full rounded-md border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div className="flex items-end pb-1">
                <button
                  type="button"
                  onClick={() => removeWebsite(row.key)}
                  disabled={websites.length === 1 && row.url === ""}
                  className="text-xs text-brand hover:text-brand-hover disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={addWebsite}
            className="rounded-md border border-rule bg-canvas px-3 py-1.5 text-sm font-medium text-ink hover:border-brand hover:text-brand"
          >
            + Add another vendor website
          </button>
        </div>

        {state.errors.websites?.map((e) => (
          <p key={e} className="mt-2 text-xs text-brand">
            {e}
          </p>
        ))}
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
        <Link href="/inventory/items" className="text-sm text-ink-dim underline hover:text-ink">
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
  readOnly,
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
  readOnly?: boolean;
}) {
  // Global UX rule: every numeric input shows 2 decimals and accepts decimals.
  const isNumber = type === "number";
  const effectiveStep = isNumber ? (step ?? "0.01") : step;
  const effectiveDefault =
    isNumber && defaultValue !== undefined && defaultValue !== ""
      ? to2Dp(defaultValue)
      : defaultValue;
  const inputMode = isNumber ? "decimal" : undefined;

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
        inputMode={inputMode}
        defaultValue={effectiveDefault}
        required={required}
        step={effectiveStep}
        min={min}
        readOnly={readOnly}
        onBlur={
          isNumber
            ? (e) => {
                const v = e.target.value;
                if (v === "") return;
                const n = Number(v);
                if (!Number.isNaN(n)) e.target.value = to2Dp(n);
              }
            : undefined
        }
        className={`mt-1 block w-full rounded-md border border-rule px-3 py-2 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand ${
          readOnly ? "cursor-not-allowed bg-canvas/50 text-ink-dim" : "bg-canvas"
        }`}
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
