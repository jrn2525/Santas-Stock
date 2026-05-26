"use client";

import { useActionState, useState } from "react";
import { updateSettings } from "@/lib/actions/settings";
import { emptyFormState, type FormState } from "@/lib/actions/state";
import type { AppSettings } from "@/lib/settings";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Every quarter-hour of the day, value as 24h "HH:MM" and a friendly 12h
// label, so the time dropdown only ever offers 15-minute increments.
const TIME_OPTIONS: { value: string; label: string }[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 15, 30, 45]) {
    const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const period = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const label = `${h12}:${String(m).padStart(2, "0")} ${period}`;
    TIME_OPTIONS.push({ value, label });
  }
}

type TimeRow = { id: string; value: string };
let timeKeyCounter = 0;
const newTimeKey = () => `t-${++timeKeyCounter}`;

const lastSyncFmt = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateSettings,
    emptyFormState,
  );

  const [autoSyncEnabled, setAutoSyncEnabled] = useState(settings.autoSyncEnabled);
  const [autoSyncDays, setAutoSyncDays] = useState<number[]>(settings.autoSyncDays);
  const [timeRows, setTimeRows] = useState<TimeRow[]>(() =>
    settings.autoSyncTimes.map((value) => ({ id: newTimeKey(), value })),
  );

  const toggleDay = (idx: number) =>
    setAutoSyncDays((d) =>
      d.includes(idx) ? d.filter((x) => x !== idx) : [...d, idx],
    );
  const addTime = () =>
    setTimeRows((rs) => [...rs, { id: newTimeKey(), value: "08:00" }]);
  const updateTime = (id: string, value: string) =>
    setTimeRows((rs) => rs.map((r) => (r.id === id ? { ...r, value } : r)));
  const removeTime = (id: string) =>
    setTimeRows((rs) => rs.filter((r) => r.id !== id));

  const lastSync = settings.lastAutoSyncAt
    ? lastSyncFmt.format(new Date(settings.lastAutoSyncAt))
    : null;

  // Inject the controlled auto-sync fields (the rest of the form is
  // uncontrolled / read straight from FormData).
  const submit = (formData: FormData) => {
    formData.set("autoSyncEnabled", autoSyncEnabled ? "on" : "");
    formData.set("autoSyncDays", JSON.stringify(autoSyncDays));
    formData.set(
      "autoSyncTimes",
      JSON.stringify(timeRows.map((r) => r.value).filter((v) => v)),
    );
    formAction(formData);
  };

  return (
    <form
      action={submit}
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

      <Section title="Auto-sync">
        <label className="flex items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={autoSyncEnabled}
            onChange={(e) => setAutoSyncEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-rule bg-canvas text-brand focus:ring-brand"
          />
          <span>
            Enable scheduled auto-sync
            <span className="ml-2 text-xs text-ink-dim">
              Runs the full Jobber sync (customers, jobs, visits, notes)
              automatically at the times below.
            </span>
          </span>
        </label>

        {autoSyncEnabled && (
          <div className="mt-5 space-y-5">
            <div>
              <span className="block text-sm font-medium text-ink">Days</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {DAY_LABELS.map((label, idx) => {
                  const on = autoSyncDays.includes(idx);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleDay(idx)}
                      aria-pressed={on}
                      className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                        on
                          ? "border-brand bg-brand text-ink"
                          : "border-rule bg-canvas text-ink-dim hover:border-brand"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {state.errors.autoSyncDays?.map((e) => (
                <p key={e} className="mt-1 text-xs text-brand">
                  {e}
                </p>
              ))}
            </div>

            <div>
              <span className="block text-sm font-medium text-ink">Times</span>
              <p className="mt-1 text-xs text-ink-dim">
                Eastern Time, in 15-minute increments.
              </p>
              <div className="mt-2 space-y-2">
                {timeRows.length === 0 && (
                  <p className="text-xs text-ink-dim">
                    No times yet — add one below.
                  </p>
                )}
                {timeRows.map((row) => (
                  <div key={row.id} className="flex items-center gap-3">
                    <select
                      value={row.value}
                      onChange={(e) => updateTime(row.id, e.target.value)}
                      className="rounded-md border border-rule bg-canvas px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                    >
                      {TIME_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeTime(row.id)}
                      className="text-xs text-brand hover:text-brand-hover"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addTime}
                className="mt-3 rounded-md border border-rule bg-canvas px-3 py-1.5 text-sm font-medium text-ink hover:border-brand hover:text-brand"
              >
                + Add time
              </button>
              {state.errors.autoSyncTimes?.map((e) => (
                <p key={e} className="mt-1 text-xs text-brand">
                  {e}
                </p>
              ))}
            </div>
          </div>
        )}

        {lastSync && (
          <p className="mt-4 text-xs text-ink-dim">
            Last auto-sync: <span className="text-ink">{lastSync}</span>
          </p>
        )}
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
