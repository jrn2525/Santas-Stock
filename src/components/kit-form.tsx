"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ItemStatus, ProductType } from "@prisma/client";
import { createKit, updateKit } from "@/lib/actions/kits";
import { emptyFormState, type FormState } from "@/lib/actions/state";
import { to2Dp } from "@/lib/format";

type ItemOption = { id: string; name: string };

type KitItemRow = { key: string; itemId: string; quantity: string };

type Kit = {
  id: string;
  name: string;
  description: string;
  sku: string | null;
  manufacturer: string | null;
  model: string | null;
  productType: ProductType | null;
  status: ItemStatus;
  quantity: number;
  active: boolean;
  homeLocation: string | null;
  currentLocation: string | null;
  unitCost: { toString(): string } | null;
  items: { itemId: string; quantity: number | { toString(): string } }[];
  jobberProductId: string | null;
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

let rowKeyCounter = 0;
const newKey = () => `row-${++rowKeyCounter}`;

export function KitForm({ kit, items }: { kit?: Kit; items: ItemOption[] }) {
  const action = kit ? updateKit.bind(null, kit.id) : createKit;

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    emptyFormState,
  );

  const [rows, setRows] = useState<KitItemRow[]>(() => {
    if (kit && kit.items.length > 0) {
      return kit.items.map((ki) => ({
        key: newKey(),
        itemId: ki.itemId,
        quantity: to2Dp(ki.quantity),
      }));
    }
    return [{ key: newKey(), itemId: "", quantity: "1.00" }];
  });

  const updateRow = (key: string, patch: Partial<KitItemRow>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRow = (key: string) => {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  };

  const addRow = () => {
    setRows((rs) => [...rs, { key: newKey(), itemId: "", quantity: "1.00" }]);
  };

  const submitWithItems = (formData: FormData) => {
    const payload = rows.map((r) => ({
      itemId: r.itemId,
      quantity: Number(r.quantity) || 0,
    }));
    formData.set("kitItems", JSON.stringify(payload));
    formAction(formData);
  };

  // Once a Kit exists, Name / Description / Unit Cost are owned by Jobber
  // and can only be changed there. The create form still allows entering
  // them so manually-created Kits can be seeded.
  const editing = !!kit;

  return (
    <form action={submitWithItems} className="mt-6 max-w-3xl space-y-6">
      {editing && (
        <div className="rounded-md border border-rule bg-card p-4 text-sm text-white">
          🔒 <strong className="text-ink">Name</strong>,{" "}
          <strong className="text-ink">Description</strong>, and{" "}
          <strong className="text-ink">Unit Cost</strong> are managed in
          Jobber. To change them, edit the service in Jobber and re-run
          Inventory → Jobber → Sync.
        </div>
      )}

      <Section title="Identity">
        <div className="grid grid-cols-1 gap-5">
          <Field
            label="Name"
            name="name"
            defaultValue={kit?.name ?? ""}
            errors={state.errors.name}
            required
            placeholder='24" Red Wreath Kit'
            readOnly={editing}
          />
          <Field
            label="Description"
            name="description"
            defaultValue={kit?.description ?? ""}
            errors={state.errors.description}
            readOnly={editing}
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Field
              label="SKU"
              name="sku"
              defaultValue={kit?.sku ?? ""}
              errors={state.errors.sku}
            />
            <Field
              label="Manufacturer"
              name="manufacturer"
              defaultValue={kit?.manufacturer ?? ""}
              errors={state.errors.manufacturer}
            />
            <Field
              label="Model"
              name="model"
              defaultValue={kit?.model ?? ""}
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
              value="Service"
              readOnly
              className="mt-1 block w-full cursor-not-allowed rounded-md border border-rule bg-canvas/50 px-3 py-2 text-ink-dim"
            />
            <p className="mt-1 text-xs text-ink-dim">
              Kits are always Services. Products belong on the Items tab.
            </p>
          </div>

          <SelectField
            label="Product type"
            name="productType"
            defaultValue={kit?.productType ?? ""}
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
            defaultValue={kit?.status ?? "AVAILABLE"}
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
            defaultValue={kit?.quantity ?? 0}
            errors={state.errors.quantity}
            required
          />
          <div className="sm:col-span-2 flex items-end pb-1">
            <label className="flex items-center gap-3 text-sm text-ink">
              <input
                type="checkbox"
                name="active"
                defaultChecked={kit?.active ?? true}
                className="h-4 w-4 rounded border-rule bg-canvas text-brand focus:ring-brand"
              />
              <span>
                Active
                <span className="ml-2 text-xs text-ink-dim">
                  Uncheck to hide this kit from pickers without deleting it.
                </span>
              </span>
            </label>
          </div>
        </div>
      </Section>

      <Section title="Location">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Home location"
            name="homeLocation"
            defaultValue={kit?.homeLocation ?? ""}
            errors={state.errors.homeLocation}
            help='Where it lives in the off-season.'
          />
          <Field
            label="Current location"
            name="currentLocation"
            defaultValue={kit?.currentLocation ?? ""}
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
              defaultValue={kit?.unitCost != null ? to2Dp(kit.unitCost) : ""}
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
          {state.errors.unitCost?.map((e) => (
            <p key={e} className="mt-1 text-xs text-brand">
              {e}
            </p>
          ))}
        </div>
      </Section>

      <Section title="Items in this kit">
        <p className="mb-4 text-xs text-ink-dim">
          Build the recipe: pick each ingredient and how many of it the kit
          needs. Click <em>+ Add another item</em> for as many as you need.
        </p>

        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_120px_auto] gap-3 rounded-md border border-rule bg-canvas p-3"
            >
              <div>
                <label
                  htmlFor={`item-${row.key}`}
                  className="block text-xs font-medium text-ink-dim"
                >
                  Item {idx + 1}
                </label>
                <ItemPicker
                  inputId={`item-${row.key}`}
                  options={items}
                  value={row.itemId}
                  onChange={(v) => updateRow(row.key, { itemId: v })}
                />
              </div>

              <div>
                <label
                  htmlFor={`qty-${row.key}`}
                  className="block text-xs font-medium text-ink-dim"
                >
                  Quantity
                </label>
                <input
                  id={`qty-${row.key}`}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  value={row.quantity}
                  onChange={(e) =>
                    updateRow(row.key, { quantity: e.target.value })
                  }
                  onBlur={(e) => {
                    if (e.target.value === "") {
                      updateRow(row.key, { quantity: "1.00" });
                      return;
                    }
                    const n = Number(e.target.value);
                    if (!Number.isNaN(n)) {
                      updateRow(row.key, { quantity: to2Dp(n) });
                    }
                  }}
                  className="mt-1 block w-full rounded-md border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  required
                />
              </div>

              <div className="flex items-end pb-1">
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length === 1}
                  className="text-xs text-brand hover:text-brand-hover disabled:cursor-not-allowed disabled:opacity-30"
                  title={
                    rows.length === 1
                      ? "A kit must have at least one item."
                      : "Remove"
                  }
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
            onClick={addRow}
            className="rounded-md border border-rule bg-canvas px-3 py-1.5 text-sm font-medium text-ink hover:border-brand hover:text-brand"
          >
            + Add another item
          </button>
        </div>

        {state.errors.kitItems?.map((e) => (
          <p key={e} className="mt-2 text-xs text-brand">
            {e}
          </p>
        ))}
        {state.errors._form?.map((e) => (
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
          {pending ? "Saving..." : kit ? "Save changes" : "Create kit"}
        </button>
        <Link href="/inventory/kits" className="text-sm text-ink-dim underline hover:text-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}

// Searchable Item picker built on a <datalist>. The user can type to filter
// the names; the underlying value is the Item's id. A native <select> would
// work but doesn't filter on type, and the catalog can easily have hundreds
// of Items.
function ItemPicker({
  inputId,
  options,
  value,
  onChange,
}: {
  inputId: string;
  options: ItemOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const listId = `${inputId}-list`;
  const selected = options.find((o) => o.id === value);
  const [text, setText] = useState(selected?.name ?? "");

  // Keep text in sync when the row is re-rendered with a different selection
  // (e.g. after add/remove).
  if (selected && selected.name !== text && value !== "") {
    // no-op — leave whatever the user is typing alone
  }

  const handleChange = (raw: string) => {
    setText(raw);
    // Exact-name match wins.
    const match = options.find((o) => o.name === raw);
    onChange(match ? match.id : "");
  };

  return (
    <>
      <input
        id={inputId}
        type="text"
        list={listId}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Type to search items..."
        autoComplete="off"
        className="mt-1 block w-full rounded-md border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        required
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.id} value={o.name} />
        ))}
      </datalist>
    </>
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
  placeholder,
  help,
  min,
  readOnly,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  errors?: string[];
  required?: boolean;
  placeholder?: string;
  help?: string;
  min?: number;
  readOnly?: boolean;
}) {
  const isNumber = type === "number";
  const effectiveDefault =
    isNumber && defaultValue !== undefined && defaultValue !== ""
      ? to2Dp(defaultValue)
      : defaultValue;

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
        inputMode={isNumber ? "decimal" : undefined}
        step={isNumber ? "0.01" : undefined}
        defaultValue={effectiveDefault}
        required={required}
        placeholder={placeholder}
        min={min}
        readOnly={readOnly}
        onBlur={
          isNumber
            ? (e) => {
                if (e.target.value === "") return;
                const n = Number(e.target.value);
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
