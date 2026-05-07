"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createKit, updateKit } from "@/lib/actions/kits";
import { emptyFormState, type FormState } from "@/lib/actions/state";

type ItemOption = { id: string; name: string };

type KitItemRow = { key: string; itemId: string; quantity: number };

type Kit = {
  id: string;
  name: string;
  items: { itemId: string; quantity: number }[];
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
        quantity: ki.quantity,
      }));
    }
    return [{ key: newKey(), itemId: "", quantity: 1 }];
  });

  const updateRow = (key: string, patch: Partial<KitItemRow>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRow = (key: string) => {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  };

  const addRow = () => {
    setRows((rs) => [...rs, { key: newKey(), itemId: "", quantity: 1 }]);
  };

  const submitWithItems = (formData: FormData) => {
    const payload = rows.map((r) => ({
      itemId: r.itemId,
      quantity: Number(r.quantity) || 0,
    }));
    formData.set("kitItems", JSON.stringify(payload));
    formAction(formData);
  };

  return (
    <form action={submitWithItems} className="mt-6 max-w-3xl space-y-6">
      <Section title="Identity">
        <Field
          label="Name"
          name="name"
          defaultValue={kit?.name ?? ""}
          errors={state.errors.name}
          required
          placeholder="24&quot; Red Wreath Kit"
        />
      </Section>

      <Section title="Items in this kit">
        <p className="mb-4 text-xs text-gray-500">
          Build the recipe: pick each ingredient and how many of it the kit needs.
        </p>

        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_120px_auto] gap-3 rounded-md border border-gray-700 bg-gray-900/40 p-3"
            >
              <div>
                <label
                  htmlFor={`item-${row.key}`}
                  className="block text-xs font-medium text-gray-400"
                >
                  Item {idx + 1}
                </label>
                <select
                  id={`item-${row.key}`}
                  value={row.itemId}
                  onChange={(e) => updateRow(row.key, { itemId: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-santa-red focus:outline-none focus:ring-1 focus:ring-santa-red"
                  required
                >
                  <option value="">— Select item —</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor={`qty-${row.key}`}
                  className="block text-xs font-medium text-gray-400"
                >
                  Quantity
                </label>
                <input
                  id={`qty-${row.key}`}
                  type="number"
                  min={1}
                  value={row.quantity}
                  onChange={(e) =>
                    updateRow(row.key, { quantity: Number(e.target.value) || 1 })
                  }
                  className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-santa-red focus:outline-none focus:ring-1 focus:ring-santa-red"
                  required
                />
              </div>

              <div className="flex items-end pb-1">
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length === 1}
                  className="text-xs text-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30"
                  title={rows.length === 1 ? "A kit must have at least one item." : "Remove"}
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
            className="rounded-md border border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-200 hover:bg-gray-800"
          >
            + Add item
          </button>
        </div>

        {state.errors.kitItems?.map((e) => (
          <p key={e} className="mt-2 text-xs text-red-400">
            {e}
          </p>
        ))}
        {state.errors._form?.map((e) => (
          <p key={e} className="mt-2 text-xs text-red-400">
            {e}
          </p>
        ))}
      </Section>

      {state.message && <p className="text-sm text-red-400">{state.message}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-santa-red px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Saving..." : kit ? "Save changes" : "Create kit"}
        </button>
        <Link href="/kits" className="text-sm text-gray-400 underline hover:text-white">
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
  defaultValue,
  errors,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  errors?: string[];
  required?: boolean;
  placeholder?: string;
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
        placeholder={placeholder}
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
