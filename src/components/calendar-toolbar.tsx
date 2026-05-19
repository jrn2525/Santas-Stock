import Link from "next/link";
import { CalendarPrintButton } from "./calendar-print-button";
import {
  addDaysET,
  addMonthsET,
  formatDateParam,
  todayET,
} from "@/lib/datetime";

export type CalendarView = "month" | "week" | "day";

function navHref(view: CalendarView, date: Date): string {
  return `/job-flow/calendar?view=${view}&date=${formatDateParam(date)}`;
}

function shiftDate(view: CalendarView, anchor: Date, direction: -1 | 1): Date {
  if (view === "month") return addMonthsET(anchor, direction);
  if (view === "week") return addDaysET(anchor, 7 * direction);
  return addDaysET(anchor, direction);
}

export function CalendarToolbar({
  view,
  anchor,
  periodLabel,
}: {
  view: CalendarView;
  anchor: Date;
  periodLabel: string;
}) {
  const prevDate = shiftDate(view, anchor, -1);
  const nextDate = shiftDate(view, anchor, 1);
  const today = todayET();

  return (
    <div className="no-print mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-rule bg-card p-3">
      <div className="flex items-center gap-2">
        <Link
          href={navHref(view, prevDate)}
          className="rounded border border-rule px-2 py-1 text-sm text-ink hover:border-brand hover:text-brand"
          aria-label="Previous"
        >
          ‹
        </Link>
        <Link
          href={navHref(view, today)}
          className="rounded border border-rule px-2 py-1 text-sm text-ink hover:border-brand hover:text-brand"
        >
          Today
        </Link>
        <Link
          href={navHref(view, nextDate)}
          className="rounded border border-rule px-2 py-1 text-sm text-ink hover:border-brand hover:text-brand"
          aria-label="Next"
        >
          ›
        </Link>
        <div className="ml-3 text-sm font-medium text-ink">{periodLabel}</div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-rule">
          {(["month", "week", "day"] as CalendarView[]).map((v) => {
            const active = v === view;
            return (
              <Link
                key={v}
                href={navHref(v, anchor)}
                className={`px-3 py-1.5 text-sm capitalize ${
                  active
                    ? "bg-brand text-ink"
                    : "text-ink hover:bg-canvas/40"
                }`}
              >
                {v}
              </Link>
            );
          })}
        </div>
        <CalendarPrintButton />
      </div>
    </div>
  );
}
