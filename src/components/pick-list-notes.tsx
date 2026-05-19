"use client";

import { useState } from "react";

type Note = {
  id: string;
  body: string;
  noteCreatedAt: string | null;
};

const dayFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function PickListNotes({
  jobNotes,
  clientNotes,
}: {
  jobNotes: Note[];
  clientNotes: Note[];
}) {
  const initial = new Map<string, boolean>();
  for (const n of jobNotes) initial.set(n.id, true);
  for (const n of clientNotes) initial.set(n.id, true);
  const [checked, setChecked] = useState<Map<string, boolean>>(initial);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Map(prev);
      next.set(id, !next.get(id));
      return next;
    });
  }

  function handlePrint() {
    window.print();
  }

  const hasNotes = jobNotes.length > 0 || clientNotes.length > 0;

  return (
    <section className="mt-6 rounded-lg border border-rule bg-card p-6 print-block">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-ink">Notes</h2>
          <p className="mt-1 text-sm text-ink-dim no-print">
            Uncheck any note you don&apos;t want to include in the printout.
          </p>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="no-print rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-ink hover:bg-brand-hover"
        >
          Print
        </button>
      </header>

      {!hasNotes ? (
        <p className="mt-6 text-sm text-ink-dim">
          No notes for this job. Run Sync Jobs in Job Flow → Jobber to pull
          them in.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {jobNotes.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wider text-ink-dim">
                On this job
              </h3>
              <ul className="mt-2 space-y-2">
                {jobNotes.map((n) => (
                  <NoteRow
                    key={n.id}
                    note={n}
                    checked={!!checked.get(n.id)}
                    onToggle={() => toggle(n.id)}
                  />
                ))}
              </ul>
            </div>
          )}
          {clientNotes.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wider text-ink-dim">
                On the customer
              </h3>
              <ul className="mt-2 space-y-2">
                {clientNotes.map((n) => (
                  <NoteRow
                    key={n.id}
                    note={n}
                    checked={!!checked.get(n.id)}
                    onToggle={() => toggle(n.id)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function NoteRow({
  note,
  checked,
  onToggle,
}: {
  note: Note;
  checked: boolean;
  onToggle: () => void;
}) {
  const created = note.noteCreatedAt ? new Date(note.noteCreatedAt) : null;
  return (
    <li
      className={`flex gap-3 rounded border border-rule bg-canvas p-3 ${
        checked ? "" : "note-unchecked"
      }`}
    >
      <label className="no-print flex shrink-0 cursor-pointer items-start pt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-4 w-4 cursor-pointer accent-brand"
        />
      </label>
      <div className="flex-1">
        <p className="whitespace-pre-line text-sm text-ink">{note.body}</p>
        {created && (
          <p className="mt-1 text-xs text-ink-dim">{dayFmt.format(created)}</p>
        )}
      </div>
    </li>
  );
}
