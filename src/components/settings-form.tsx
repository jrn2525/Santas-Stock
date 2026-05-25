"use client";

import { useActionState } from "react";
import { updateSettings } from "@/lib/actions/settings";
import { emptyFormState, type FormState } from "@/lib/actions/state";
import type { AppSettings } from "@/lib/settings";

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateSettings,
    emptyFormState,
  );

  return (
    <form
      action={formAction}
      encType="multipart/form-data"
      className="mt-6 max-w-3xl space-y-6"
    >
      <Section title="Branding">
        <div className="grid grid-cols-1 gap-5">
          <Field
            label="Business name"
            name="businessName"
            defaultValue={settings.businessName}
            errors={state.errors.businessName}
            required
            help="Shown in the browser tab and as the logo's alt text."
          />

          <div>
            <span className="block text-sm font-medium text-ink">Logo</span>
            {settings.hasCustomLogo ? (
              <div className="mt-2 flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/branding/logo?v=${settings.logoVersion}`}
                  alt="Current logo"
                  className="h-16 w-auto rounded border border-rule bg-canvas p-1"
                />
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    name="removeLogo"
                    className="h-4 w-4 rounded border-rule bg-canvas text-brand focus:ring-brand"
                  />
                  Remove custom logo (revert to default)
                </label>
              </div>
            ) : (
              <p className="mt-2 text-xs text-ink-dim">
                Using the built-in default logo.
              </p>
            )}
            <input
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="mt-3 block w-full text-sm text-ink-dim file:mr-3 file:rounded-md file:border file:border-rule file:bg-canvas file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:border-brand"
            />
            <p className="mt-1 text-xs text-ink-dim">
              PNG, JPEG, WebP, or SVG, under 1 MB. Leave empty to keep the
              current logo.
            </p>
            {state.errors.logo?.map((e) => (
              <p key={e} className="mt-1 text-xs text-brand">
                {e}
              </p>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Calendar defaults">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <SelectField
            label="Default view"
            name="calendarDefaultView"
            defaultValue={settings.calendarDefaultView}
            errors={state.errors.calendarDefaultView}
          >
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="day">Day</option>
          </SelectField>
          <Field
            label="Day starts at (hour)"
            name="calendarHourStart"
            type="number"
            min={0}
            max={23}
            defaultValue={settings.calendarHourStart}
            errors={state.errors.calendarHourStart}
            help="0–23. The grid still expands to fit earlier visits."
          />
          <Field
            label="Day ends at (hour)"
            name="calendarHourEnd"
            type="number"
            min={1}
            max={24}
            defaultValue={settings.calendarHourEnd}
            errors={state.errors.calendarHourEnd}
            help="1–24, after the start hour."
          />
        </div>
      </Section>

      <Section title="Inventory defaults">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field
            label="Rows per page"
            name="defaultPageSize"
            type="number"
            min={10}
            max={200}
            defaultValue={settings.defaultPageSize}
            errors={state.errors.defaultPageSize}
            help="Applies to every list page. 10–200."
          />
          <SelectField
            label="Pick List default window"
            name="pickListDefaultWindow"
            defaultValue={settings.pickListDefaultWindow}
            errors={state.errors.pickListDefaultWindow}
          >
            <option value="week">Next 7 days</option>
            <option value="month">Next 30 days</option>
            <option value="all">All time</option>
          </SelectField>
          <Field
            label="Low-stock default"
            name="lowStockDefaultThreshold"
            type="number"
            min={0}
            defaultValue={settings.lowStockDefaultThreshold}
            errors={state.errors.lowStockDefaultThreshold}
            help="Used when an item has no minimum of its own. 0 disables it."
          />
        </div>
      </Section>

      {state.message && <p className="text-sm text-brand">{state.message}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-hover disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save settings"}
        </button>
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
  min,
  max,
  help,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  errors?: string[];
  required?: boolean;
  min?: number;
  max?: number;
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
        inputMode={type === "number" ? "numeric" : undefined}
        step={type === "number" ? 1 : undefined}
        defaultValue={defaultValue}
        required={required}
        min={min}
        max={max}
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
      <label htmlFor={name} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="mt-1 block w-full rounded-md border border-rule bg-canvas px-3 py-2 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      >
        {children}
      </select>
      {errors?.map((e) => (
        <p key={e} className="mt-1 text-xs text-brand">
          {e}
        </p>
      ))}
    </div>
  );
}
